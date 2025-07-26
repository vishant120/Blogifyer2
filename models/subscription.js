const { Schema, model } = require("mongoose");

const subscriptionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  endpoint: { type: String, required: true },
  p256dh: { type: String, required: true },
  auth: { type: String, required: true },
}, { timestamps: true });

module.exports = model("Subscription", subscriptionSchema);
