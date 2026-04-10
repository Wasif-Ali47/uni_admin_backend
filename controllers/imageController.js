const fs = require("fs/promises");
const mongoose = require("mongoose");
const OpenAI = require("openai");
const GeneratedImage = require("../models/generatedImageModel");
const ImageLike = require("../models/likeModel");
const User = require("../models/usersModel");
const {
  saveRemoteImageToUserGenerations,
  saveRemoteGuestImage,
} = require("../services/generationStorage");
const {
  NETWORK_ERROR,
  PROMPT_REQUIRED,
  IMAGE_GEN_FAILED,
  IMAGE_URL_REQUIRED,
  IMAGE_NOT_FOUND,
  INVALID_IMAGE_ID,
} = require("../messages/message");

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const err = new Error("OPENAI_API_KEY is not configured");
    err.statusCode = 503;
    throw err;
  }
  return new OpenAI({ apiKey: key });
}

const DALLE3_SIZES = new Set(["1024x1024", "1024x1792", "1792x1024"]);

function logImageGenFailure(context, err, extra = {}) {
  const openaiBody = err?.response?.data ?? err?.error ?? err?.body;
  console.error(`[${context}] Image generation failed:`, {
    message: err?.message,
    status: err?.status,
    code: err?.code,
    openai: openaiBody,
    ...extra,
  });
  if (err?.stack) console.error(err.stack);
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function userEmailForStorage(req, res) {
  const email = req.user?.email;
  if (!email || typeof email !== "string" || !email.trim()) {
    res.status(401).json({
      error: "Email missing from session; log in again.",
    });
    return null;
  }
  return email.trim();
}

async function handleGenerateImage(req, res) {
  const { prompt, size, quality } = req.body;
  const userId = req.user._id;
  const userEmail = userEmailForStorage(req, res);
  if (!userEmail) return;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: PROMPT_REQUIRED });
  }

  const resolvedSize =
    size && DALLE3_SIZES.has(size) ? size : "1024x1024";
  const resolvedQuality =
    quality === "hd" || quality === "standard" ? quality : "standard";

  let client;
  try {
    client = getClient();
  } catch (e) {
    return res.status(e.statusCode || 503).json({ error: e.message });
  }

  try {
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt: prompt.trim(),
      n: 1,
      size: resolvedSize,
      quality: resolvedQuality,
    });

    const item = response.data?.[0];
    const imageUrl = item?.url;
    const revisedPrompt = item?.revised_prompt;

    if (!imageUrl) {
      logImageGenFailure("generate", new Error("no image URL in OpenAI response"), {
        responseData: response?.data,
      });
      return res.status(502).json({
        error: IMAGE_GEN_FAILED,
        detail: "OpenAI returned no image URL",
      });
    }

    let saved;
    try {
      saved = await saveRemoteImageToUserGenerations(imageUrl, userEmail);
    } catch (dlErr) {
      logImageGenFailure("generate-save-disk", dlErr);
      return res.status(502).json({
        error: dlErr.message || IMAGE_GEN_FAILED,
      });
    }

    let doc;
    try {
      doc = await GeneratedImage.create({
        userId,
        prompt: prompt.trim(),
        revisedPrompt,
        imageUrl: saved.publicPath,
        model: "dall-e-3",
        size: resolvedSize,
        likesCount: 0,
      });
    } catch (dbErr) {
      await fs.unlink(saved.filePath).catch(() => {});
      throw dbErr;
    }

    return res.status(201).json({
      id: doc._id,
      imageUrl: saved.publicPath,
      revisedPrompt,
      size: resolvedSize,
      quality: resolvedQuality,
    });
  } catch (err) {
    logImageGenFailure("generate-openai", err);
    const msg =
      err?.response?.data?.error?.message ||
      err?.error?.message ||
      err?.message ||
      IMAGE_GEN_FAILED;
    return res.status(502).json({ error: msg });
  }
}

/**
 * No auth. Saves file to uploads/guest/ only — not stored in MongoDB or user history.
 */
async function handleGuestGenerateImage(req, res) {
  const { prompt, size, quality } = req.body;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: PROMPT_REQUIRED });
  }

  const resolvedSize =
    size && DALLE3_SIZES.has(size) ? size : "1024x1024";
  const resolvedQuality =
    quality === "hd" || quality === "standard" ? quality : "standard";

  let client;
  try {
    client = getClient();
  } catch (e) {
    logImageGenFailure("guest-generate-config", e);
    return res.status(e.statusCode || 503).json({ error: e.message });
  }

  try {
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt: prompt.trim(),
      n: 1,
      size: resolvedSize,
      quality: resolvedQuality,
    });

    const item = response.data?.[0];
    const imageUrl = item?.url;
    const revisedPrompt = item?.revised_prompt;

    if (!imageUrl) {
      logImageGenFailure("guest-generate", new Error("no image URL in OpenAI response"), {
        responseData: response?.data,
      });
      return res.status(502).json({
        error: IMAGE_GEN_FAILED,
        detail: "OpenAI returned no image URL",
      });
    }

    let saved;
    try {
      saved = await saveRemoteGuestImage(imageUrl);
    } catch (dlErr) {
      logImageGenFailure("guest-generate-save-disk", dlErr);
      return res.status(502).json({
        error: dlErr.message || IMAGE_GEN_FAILED,
      });
    }

    return res.status(201).json({
      guest: true,
      imageUrl: saved.publicPath,
      revisedPrompt,
      size: resolvedSize,
      quality: resolvedQuality,
    });
  } catch (err) {
    logImageGenFailure("guest-generate-openai", err);
    const msg =
      err?.response?.data?.error?.message ||
      err?.error?.message ||
      err?.message ||
      IMAGE_GEN_FAILED;
    return res.status(502).json({ error: msg });
  }
}

/** Store an existing prompt + image URL (no OpenAI call). */
async function handleStorePromptImage(req, res) {
  const { prompt, imageUrl, revisedPrompt } = req.body;
  const userId = req.user._id;
  const userEmail = userEmailForStorage(req, res);
  if (!userEmail) return;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: PROMPT_REQUIRED });
  }
  if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.trim()) {
    return res.status(400).json({ error: IMAGE_URL_REQUIRED });
  }

  const trimmedUrl = imageUrl.trim();

  let saved;
  try {
    saved = await saveRemoteImageToUserGenerations(trimmedUrl, userEmail);
  } catch (dlErr) {
    console.error("download image for store failed:", dlErr);
    return res.status(502).json({
      error: dlErr.message || IMAGE_GEN_FAILED,
    });
  }

  let doc;
  try {
    doc = await GeneratedImage.create({
      userId,
      prompt: prompt.trim(),
      revisedPrompt:
        typeof revisedPrompt === "string" && revisedPrompt.trim()
          ? revisedPrompt.trim()
          : undefined,
      imageUrl: saved.publicPath,
      model: "stored",
      likesCount: 0,
    });
  } catch (err) {
    await fs.unlink(saved.filePath).catch(() => {});
    console.error("Store prompt/image error:", err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }

  return res.status(201).json({
    id: doc._id,
    prompt: doc.prompt,
    imageUrl: doc.imageUrl,
    revisedPrompt: doc.revisedPrompt,
    likesCount: doc.likesCount,
  });
}

function mapGenerationDoc(row) {
  return {
    id: row._id,
    prompt: row.prompt,
    revisedPrompt: row.revisedPrompt,
    imageUrl: row.imageUrl,
    likesCount: row.likesCount ?? 0,
    model: row.model,
    size: row.size,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Authenticated list of this user's generations from MongoDB (for "Your generations" UI). */
async function handleYourGenerations(req, res) {
  const userId = req.user._id;
  const limit = Math.min(
    Math.max(parseInt(req.query.limit, 10) || 50, 1),
    100
  );
  const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

  try {
    const [total, rows] = await Promise.all([
      GeneratedImage.countDocuments({ userId }),
      GeneratedImage.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.json({
      section: "your generations",
      total,
      limit,
      skip,
      items: rows.map(mapGenerationDoc),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

async function handleListMyImages(req, res) {
  try {
    const list = await GeneratedImage.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json(
      list.map((row) => ({
        ...row,
        likesCount: row.likesCount ?? 0,
      }))
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

const TRENDING_POOL_MAX = 50;
const TRENDING_SAMPLE_SIZE = 10;

async function handleTrending(req, res) {
  try {
    const pipeline = [
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "author",
        },
      },
      {
        $match: {
          $or: [
            { author: { $size: 0 } },
            { "author.0.creationsPublic": { $ne: false } },
          ],
        },
      },
      { $sort: { likesCount: -1, createdAt: -1 } },
      { $limit: TRENDING_POOL_MAX },
      { $sample: { size: TRENDING_SAMPLE_SIZE } },
      {
        $project: {
          prompt: 1,
          revisedPrompt: 1,
          imageUrl: 1,
          likesCount: 1,
          createdAt: 1,
          authorName: { $arrayElemAt: ["$author.name", 0] },
          authorId: { $arrayElemAt: ["$author._id", 0] },
        },
      },
    ];

    const rows = await GeneratedImage.aggregate(pipeline);

    const ids = rows.map((r) => r._id);
    let likedSet = new Set();
    if (req.user?._id && ids.length) {
      const uid = req.user._id;
      const likes = await ImageLike.find({
        userId: uid,
        imageId: { $in: ids },
      })
        .select("imageId")
        .lean();
      likedSet = new Set(likes.map((l) => String(l.imageId)));
    }

    const items = rows.map((row) => ({
      id: row._id,
      prompt: row.prompt,
      revisedPrompt: row.revisedPrompt,
      imageUrl: row.imageUrl,
      likesCount: row.likesCount ?? 0,
      createdAt: row.createdAt,
      author:
        row.authorName != null
          ? { name: row.authorName, id: row.authorId }
          : null,
      likedByMe: req.user?._id
        ? likedSet.has(String(row._id))
        : false,
    }));

    return res.json({
      items,
      limit: TRENDING_SAMPLE_SIZE,
      skip: 0,
      poolMax: TRENDING_POOL_MAX,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

async function handleToggleLike(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: INVALID_IMAGE_ID });
  }

  const userId = req.user._id;

  try {
    const image = await GeneratedImage.findById(id);
    if (!image) {
      return res.status(404).json({ error: IMAGE_NOT_FOUND });
    }

    const ownerId = image.userId?.toString?.() ?? String(image.userId);
    const likerId = userId?.toString?.() ?? String(userId);
    if (ownerId !== likerId) {
      const owner = await User.findById(image.userId)
        .select("creationsPublic")
        .lean();
      if (owner && owner.creationsPublic === false) {
        return res.status(403).json({
          error: "This creation is private",
        });
      }
    }

    const removed = await ImageLike.findOneAndDelete({
      userId,
      imageId: id,
    });

    if (removed) {
      await GeneratedImage.updateOne(
        { _id: id },
        { $inc: { likesCount: -1 } }
      );
      const next = await GeneratedImage.findById(id).select("likesCount").lean();
      return res.json({
        liked: false,
        likesCount: next?.likesCount ?? 0,
      });
    }

    await ImageLike.create({ userId, imageId: id });
    await GeneratedImage.updateOne({ _id: id }, { $inc: { likesCount: 1 } });
    const next = await GeneratedImage.findById(id).select("likesCount").lean();
    return res.json({
      liked: true,
      likesCount: next?.likesCount ?? 0,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "already liked" });
    }
    console.error(err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

module.exports = {
  handleGenerateImage,
  handleGuestGenerateImage,
  handleStorePromptImage,
  handleYourGenerations,
  handleListMyImages,
  handleTrending,
  handleToggleLike,
};
