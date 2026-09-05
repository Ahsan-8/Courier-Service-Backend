import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    trackingId: { type: String, required: true, unique: true },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rider: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    pickupDetails: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        address: { type: String, required: true },
    },
    deliveryDetails: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        address: { type: String, required: true },
    },
    packageDetails: {
        weightKG: { type: Number, required: true },
        description: { type: String, required: true },
        category: {
            type: String,
            enum: ['DOCUMENTS', 'FRAGILE', 'ELECTRONICS', 'CLOTHING', 'HEAVY', 'PARCEL'],
            default: 'PARCEL',
        },
    },
    status: {
        type: String,
        enum: [
            'PENDING',
            'CONFIRMED',
            'RIDER_ASSIGNED',
            'PICKED_UP',
            'IN_TRANSIT',
            'OUT_FOR_DELIVERY',
            'DELIVERED',
            'CANCELLED',
            'RETURNED',
        ],
        default: 'PENDING',
    },
    statusHistory: [
        {
            status: { type: String, },
            updatedAt: { type: Date, default: Date.now },
            updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        },
    ],
}, { timestamps: true },
);
export default mongoose.model('Order', orderSchema);

