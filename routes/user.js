const { Router } = require("express");
const User = require("../models/user");
const Notification = require("../models/notification");
const { createTokenForUser } = require("../services/authentication");

const router = Router();

// GET /user/signin
router.get("/signin", (req, res) => {
  return res.render("signin", { title: "Sign In", user: req.user || null, error: req.query.error_msg });
});

// GET /user/signup
router.get("/signup", (req, res) => {
  return res.render("signup", { title: "Sign Up", user: req.user || null, error: req.query.error_msg });
});

// POST /user/signup
router.post("/signup", async (req, res) => {
  const { fullname, email, password } = req.body;
  try {
    await User.create({
      fullname,
      email,
      password,
      likedBlogs: [],
      bio: "",
    });
    return res.redirect("/user/signin?success_msg=Account created successfully");
  } catch (error) {
    return res.render("signup", {
      error: error.message || "Error creating user",
      title: "Sign Up",
      user: req.user || null,
    });
  }
});

// POST /user/signin
router.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  try {
    const token = await User.matchPassword(email, password);
    return res
      .cookie("token", token, { httpOnly: true })
      .redirect("/?success_msg=Signed in successfully");
  } catch (error) {
    return res.render("signin", {
      error: error.message || "Invalid credentials",
      title: "Sign In",
      user: req.user || null,
    });
  }
});

// GET /user/logout
router.get("/logout", (req, res) => {
  return res.clearCookie("token").redirect("/?success_msg=Logged out successfully");
});

// POST /user/follow/:id
router.post("/follow/:id", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin?error_msg=Please sign in to follow users");
  }

  const userIdToFollow = req.params.id;
  const currentUserId = req.user._id;

  if (userIdToFollow === currentUserId.toString()) {
    return res.redirect(`/?error_msg=You cannot follow yourself`);
  }

  try {
    const userToFollow = await User.findById(userIdToFollow);
    if (!userToFollow) {
      return res.redirect(`/?error_msg=User not found`);
    }

    // Check if follow request already exists
    const existingNotification = await Notification.findOne({
      sender: currentUserId,
      recipient: userIdToFollow,
      type: "FOLLOW_REQUEST",
      status: "PENDING",
    });

    if (existingNotification) {
      return res.redirect(`/?error_msg=Follow request already sent`);
    }

    // Create follow request notification
    await Notification.create({
      recipient: userIdToFollow,
      sender: currentUserId,
      type: "FOLLOW_REQUEST",
      message: `${req.user.fullname} wants to follow you`,
    });

    return res.redirect(`/profile/${userIdToFollow}?success_msg=Follow request sent to ${userToFollow.fullname}`);
  } catch (error) {
    console.error("Error sending follow request:", error);
    return res.redirect(`/?error_msg=Failed to send follow request`);
  }
});

// POST /user/unfollow/:id
router.post("/unfollow/:id", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin?error_msg=Please sign in to unfollow users");
  }

  const userIdToUnfollow = req.params.id;
  const currentUserId = req.user._id;

  if (userIdToUnfollow === currentUserId.toString()) {
    return res.redirect(`/?error_msg=You cannot unfollow yourself`);
  }

  try {
    const userToUnfollow = await User.findById(userIdToUnfollow);
    if (!userToUnfollow) {
      return res.redirect(`/?error_msg=User not found`);
    }

    await Promise.all([
      User.findByIdAndUpdate(currentUserId, { $pull: { following: userIdToUnfollow } }, { new: true }),
      User.findByIdAndUpdate(userIdToUnfollow, { $pull: { followers: currentUserId } }, { new: true }),
    ]);

    return res.redirect(`/profile/${userIdToUnfollow}?success_msg=Successfully unfollowed ${userToUnfollow.fullname}`);
  } catch (error) {
    console.error("Error unfollowing user:", error);
    return res.redirect(`/?error_msg=Failed to unfollow user`);
  }
});

module.exports = router;