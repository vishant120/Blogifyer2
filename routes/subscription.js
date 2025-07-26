const { Router } = require("express");
const Subscription = require("../models/subscription");
const router = Router();

router.post("/save", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Login required" });
    const { endpoint, keys } = req.body;
    await Subscription.findOneAndUpdate(
      { user: req.user._id, endpoint },
      { user: req.user._id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { upsert: true, new: true }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

module.exports = router;
