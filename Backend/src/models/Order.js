import mongoose from 'mongoose';
import { PricingEngine } from '../services/pricingEngineService.js';

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
    pickupAddress: {
        district: { type: String, default: '' },
        area: { type: String, default: '' },
    },
    deliveryAddress: {
        district: { type: String, default: '' },
        area: { type: String, default: '' },
    },
    parcel: {
        actualWeight: { type: Number, default: 0 },
        dimensions: {
            length: { type: Number, default: 0 },
            width: { type: Number, default: 0 },
            height: { type: Number, default: 0 },
        },
        category: {
            type: String,
            enum: ['DOCUMENTS', 'FRAGILE', 'ELECTRONICS', 'CLOTHING', 'HEAVY', 'PARCEL', 'Book'],
            default: 'PARCEL',
        },
        description: { type: String, default: '' },
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
            'FAILED',
            'PARTIAL_DELIVERY',
        ],
        default: 'PENDING',
    },
    failedDeliveryAttempts: {
        type: Number,
        default: 0,
    },
    financialsSettled: {
        type: Boolean,
        default: false,
    },
    pricing: {
        deliveryFee: { type: Number, default: 0 },
        codAmount: { type: Number, default: 0 },
        codAmountCollected: { type: Number, default: 0 },
        paymentMethod: {
            type: String,
            enum: ['COD', 'PREPAID', 'CARD'],
            default: 'COD',
        },
        paymentStatus: {
            type: String,
            enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
            default: 'PENDING',
        },
        zone: { type: String, default: '' },
        billableWeightKg: { type: Number, default: 0 },
        baseFee: { type: Number, default: 0 },
        weightSurcharge: { type: Number, default: 0 },
        codFee: { type: Number, default: 0 },
        returnHandlingFee: { type: Number, default: 0 },
        netPayableToMerchant: { type: Number, default: 0 },
    },
    statusHistory: [
        {
            status: { type: String },
            userRole: { type: String },
            reason: { type: String },
            notes: { type: String },
            timestamp: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now },
            updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        },
    ],
}, { timestamps: true });

// Pre-save middleware hook: Only recalculate on pricing-relevant field modifications
orderSchema.pre('save', function (next) {
    const isPricingRelevantChange =
        this.isNew ||
        this.isModified('parcel') ||
        this.isModified('pickupAddress') ||
        this.isModified('deliveryAddress') ||
        this.isModified('status') ||
        this.isModified('pricing.paymentMethod') ||
        this.isModified('pricing.codAmount') ||
        this.isModified('pricing.codAmountCollected');

    if (!isPricingRelevantChange) return next();

    const calculation = PricingEngine.calculate(
        this.parcel,
        this.pickupAddress,
        this.deliveryAddress,
        {
            category: this.parcel.category,
            paymentMethod: this.pricing.paymentMethod,
            codAmountRequested: this.pricing.codAmount,
            codAmountCollected: this.pricing.codAmountCollected,
            status: this.status,
        }
    );

    this.pricing.zone = calculation.zone;
    this.pricing.billableWeightKg = calculation.billableWeightKg;
    this.pricing.baseFee = calculation.breakdown.baseAndDistanceFee;
    this.pricing.weightSurcharge = calculation.breakdown.weightSurcharge;
    this.pricing.codFee = calculation.breakdown.codFee;
    this.pricing.returnHandlingFee = calculation.breakdown.returnHandlingFee;
    this.pricing.deliveryFee = calculation.breakdown.totalDeliveryFee;
    this.pricing.netPayableToMerchant = calculation.merchantLedger.netPayableToMerchant;

    next();
});

export default mongoose.model('Order', orderSchema);