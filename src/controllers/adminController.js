import User from '../models/User.js';
import Order from '../models/Order.js';
import Rider from '../models/Rider.js';

export const getDashboardStats = async (req, res) => {
    try {
        // Total count metrics (Fixed query order mapping)
        const [
            totalOrders,
            totalCustomers,
            totalRiders,
            activeRiders,
            pendingApplications,
        ] = await Promise.all([
            Order.countDocuments(),
            User.countDocuments({ role: 'CUSTOMER' }),
            User.countDocuments({ role: 'RIDER', isApproved: true }),
            Rider.countDocuments({ isAvailable: true, approvalStatus: 'APPROVED' }),
            Rider.countDocuments({ approvalStatus: 'PENDING' }),
        ]);

        // Order breakdown by status
        const statusCountsRaw = await Order.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        // Format status counts into an easily consumable object
        const orderStatusBreakdown = {
            PENDING: 0,
            CONFIRMED: 0,
            RIDER_ASSIGNED: 0,
            PICKED_UP: 0,
            IN_TRANSIT: 0,
            OUT_FOR_DELIVERY: 0,
            DELIVERED: 0,
            CANCELLED: 0,
            RETURNED: 0,
        };

        statusCountsRaw.forEach((item) => {
            if (orderStatusBreakdown[item._id] !== undefined) {
                orderStatusBreakdown[item._id] = item.count;
            }
        });

        // Revenue calculations (Fixed $eq operators, field names, and $ne operator)
        const revenueStats = await Order.aggregate([
            {
                $group: {
                    _id: null,
                    totalDeliveryFeeRevenue: {
                        $sum: {
                            $cond: [
                                { $eq: ['$pricing.paymentStatus', 'PAID'] },
                                '$pricing.deliveryFee',
                                0,
                            ],
                        },
                    },
                    totalCodCollected: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$pricing.paymentMethod', 'COD'] },
                                        { $eq: ['$pricing.paymentStatus', 'PAID'] },
                                    ],
                                },
                                '$pricing.codAmount',
                                0,
                            ],
                        },
                    },
                    pendingCodAmount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$pricing.paymentMethod', 'COD'] },
                                        { $eq: ['$pricing.paymentStatus', 'PENDING'] },
                                        // Use $ne so cancelled orders don't count as pending cash
                                        { $ne: ['$status', 'CANCELLED'] },
                                    ],
                                },
                                '$pricing.codAmount',
                                0,
                            ],
                        },
                    },
                },
            },
        ]);

        const revenue = revenueStats[0] || {
            totalDeliveryFeeRevenue: 0,
            totalCodCollected: 0,
            pendingCodAmount: 0,
        };

        // Recent 5 orders for dashboard feed
        const recentOrders = await Order.find()
            .populate('customer', 'name phone')
            .populate('rider', 'name phone')
            .sort({ createdAt: -1 })
            .limit(5);

        res.json({
            success: true,
            data: {
                summary: {
                    totalOrders,
                    totalCustomers,
                    totalRiders,
                    activeRiders,
                    pendingRiderApplications: pendingApplications,
                },
                financials: {
                    earnedDeliveryFee: revenue.totalDeliveryFeeRevenue,
                    collectedCodAmount: revenue.totalCodCollected,
                    pendingCodAmount: revenue.pendingCodAmount,
                },
                orderStatusBreakdown,
                recentOrders,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};