import Rider from '../models/Rider.js';

/** Order.rider stores the User _id of the assigned rider. */
export async function releaseRiderCapacity(riderUserId) {
  if (!riderUserId) return;
  await Rider.findOneAndUpdate(
    { user: riderUserId },
    { $set: { activeOrderCount: 0, isAvailable: true } }
  );
}

export async function reserveRiderForDelivery(riderUserId) {
  if (!riderUserId) return;
  await Rider.findOneAndUpdate(
    { user: riderUserId },
    { $set: { activeOrderCount: 1 } }
  );
}
