const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Blog = require("../models/blog");

// GET /search?q=...
router.get("/", async (req, res) => {
  try {
    const { q } = req.query;
    const query = q ? q.trim() : "";
    let users = [];
    let blogs = [];

    if (query) {
      // Find users (full name or email)
      users = await User.find({
        $or: [
          { fullname: { $regex: query, $options: "i" } },
          { email: { $regex: query, $options: "i" } }
        ],
      })
        .populate("followers", "fullname profileImageURL")
        .sort({ fullname: 1 });

      // Find blogs (title or body)
      blogs = await Blog.find({
        $or: [
          { title: { $regex: query, $options: "i" } },
          { body: { $regex: query, $options: "i" } }
        ],
      })
        .populate("createdBy", "fullname profileImageURL")
        .sort({ createdAt: -1 });
    }

    res.render("search", {
      user: req.user || null,
      currentUser: req.user || null,
      users,
      blogs,
      query,
      success_msg: req.query.success_msg || null,
      error_msg: req.query.error_msg || null,
    });
  } catch (err) {
    console.error("Error in search:", err);
    res.render("search", {
      user: req.user || null,
      currentUser: req.user || null,
      users: [],
      blogs: [],
      query: "",
      success_msg: null,
      error_msg: "Failed to load search results"
    });
  }
});

module.exports = router;
