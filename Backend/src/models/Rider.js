import mongoose from 'mongoose';
const riderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    vehicleType: {
        type: String,
        enum: ['BIKE', 'CAR', 'VAN', 'FOOT'],
        default: 'BIKE',
        required: true,
    },
    licenseNumber: {
        type: String,
        trim: true,
        required: true,
        unique: true,
    },
    approvalStatus: {
        type: String,
        enum: ['PENDING','APPROVED','REJECTED'],
        default: 'PENDING',
    },
    rejectionReason:{
        type: String,
        default: '',
    },
    isDeactivated: {
        type: Boolean,
        default: false,
    },
    isAvailable: {
        type: Boolean,
        default: false,
    },
    activeOrderCount: {
        type: Number,
        default: 0,
        max: 1,
    },
    totalCompletedDeliveries: {
        type: Number,
        default: 0,
    },
    currentLocation: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point',
        },
        coordinates: {
            type: [Number],
            default: [0, 0],
        },
    },
}, { timestamps: true }
);

riderSchema.index({ currentLocation: '2dsphere'});

export default mongoose.model('Rider',riderSchema);