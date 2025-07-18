const { Router } = require("express");
const { randomBytes } = require("crypto");
const bcrypt = require('bcrypt');
const User = require("../models/user");
const { sendEmail } = require("../middlewares/nodemailer");
const cloudinaryUpload = require("../middlewares/cloudinaryUpload");
const { createTokenForUser } = require("../services/authentication");
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

const router = Router();

// GET /settings
router.get("/", csrfProtection, (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin?error_msg=Please log in to view settings");
  }
  return res.render("settings", {
    user: req.user,
    success_msg: req.query.success_msg,
    error_msg: req.query.error_msg,
    showVerifyCodePopup: false,
    userId: "",
    code: "",
    csrfToken: req.csrfToken(),
  });
});

// POST /settings/update-profile
router.post("/update-profile", csrfProtection, cloudinaryUpload.single("profileImage"), async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/user/signin?error_msg=Please log in to update your profile");
    }

    const { fullname, bio } = req.body;
    const update = {};

    if (fullname?.trim()) {
      if (fullname.trim().length < 2) {
        return res.redirect("/settings?error_msg=Username must be at least 2 characters");
      }
      update.fullname = fullname.trim();
    }

    if (bio?.trim()) {
      update.bio = bio.trim();
    }

    if (req.file) {
      update.profileImageURL = req.file.path;
    }

    if (!Object.keys(update).length) {
      return res.redirect("/settings?error_msg=No changes provided");
    }

    const updatedUser = await User.findByIdAndUpdate(req.user._id, update, { new: true });
    if (!updatedUser) return res.redirect("/settings?error_msg=User not found");

    const token = createTokenForUser(updatedUser);
    res.cookie("token", token, { httpOnly: true });
    return res.redirect("/settings?success_msg=Profile updated successfully");
  } catch (err) {
    console.error("Error updating profile:", err);
    return res.redirect("/settings?error_msg=Failed to update profile");
  }
});

// POST /settings/request-password-reset
router.post("/request-password-reset", csrfProtection, async (req, res) => {
  try {
    if (!req.user) {
      return res.json({ success: false, error: "Please log in" });
    }

    const { password, confirmPassword } = req.body;
    if (!password || password.length < 8) {
      return res.json({ success: false, error: "Password must be at least 8 characters" });
    }
    if (password !== confirmPassword) {
      return res.json({ success: false, error: "Passwords do not match" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.json({ success: false, error: "User not found" });
    }

    const resetToken = randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    const resetUrl = `http://${req.headers.host}/settings/verify-password-reset/${user._id}/${resetToken}`;
    await sendEmail({
      to: user.email,
      subject: "Blogify Password Reset Verification",
      html: `
        <h2>Reset Your Blogify Password</h2>
        <p>Please click the link below to verify your password change:</p>
        <a href="${resetUrl}">Verify Password Change</a>
        <p>Or enter the following code in the verification form:</p>
        <h3>${resetToken}</h3>
        <p>This code expires in 1 hour.</p>
      `,
    });

    return res.json({ success: true, message: "Verification code sent to your email", userId: user._id, resetToken });
  } catch (error) {
    console.error("Error sending reset code:", error);
    return res.json({ success: false, error: "Failed to send verification code" });
  }
});

// GET /settings/verify-password-reset/:userId/:code
router.get("/verify-password-reset/:userId/:code", csrfProtection, async (req, res) => {
  try {
    const { userId, code } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/settings?error_msg=User not found");
    }
    if (user.resetPasswordToken !== code) {
      return res.redirect("/settings?error_msg=Invalid verification code");
    }
    if (user.resetPasswordExpires < Date.now()) {
      return res.redirect("/settings?error_msg=Verification code expired");
    }

    return res.render("settings", {
      user: req.user,
      success_msg: null,
      error_msg: null,
      showVerifyCodePopup: true,
      userId,
      code,
      csrfToken: req.csrfToken(),
    });
  } catch (error) {
    console.error("Error in verify-password-reset GET:", error);
    return res.redirect("/settings?error_msg=Failed to verify code");
  }
});

// POST /settings/verify-password-reset
router.post("/verify-password-reset", csrfProtection, async (req, res) => {
  try {
    const { userId, code, password } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, error: "User not found" });
    }
    if (user.resetPasswordToken !== code) {
      return res.json({ success: false, error: "Invalid verification code" });
    }
    if (user.resetPasswordExpires < Date.now()) {
      return res.json({ success: false, error: "Verification code expired" });
    }

    const saltRounds = 10;
    user.password = await bcrypt.hash(password, saltRounds);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    const token = createTokenForUser(user);
    res.cookie("token", token, { httpOnly: true });
    return res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Error verifying reset code:", error);
    return res.json({ success: false, error: "Failed to verify code" });
  }
});

module.exports = router;
