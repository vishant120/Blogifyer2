const webpush = require("web-push");
const Subscription = require("../models/subscription");
const EventEmitter = require("events");
const emitter = new EventEmitter();
module.exports = emitter;

emitter.on("notification:send", async ({ userId, payload }) => {
  const subs = await Subscription.find({ user: userId });
  await Promise.allSettled(
    subs.map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      )
    )
  );
});
