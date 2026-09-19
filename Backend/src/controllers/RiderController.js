import Rider from "../models/Rider.js";
import User from "../models/User.js";
import * as riderService from '../services/riderService.js';

export const applyForRider = async (req, res) => {
    try {
        const { name, email, phone, password, vehicleType, licenseNumber } = req.body;

        const userExist = await User.findOne({ $or: [{ email }, { phone }] });
        if (userExist) {
            return res.status(400).json({ message: 'User with this email or phone already exists' })
        }

        const user = await User.create({
            name,
            email,
            phone,
            password,
            role: 'RIDER',
            isApproved: false,
        });
        const rider = await Rider.create({
            user: user._id,
            vehicleType,
            licenseNumber,
            approvalStatus: 'PENDING',
            isAvailable: false,
        });

        res.status(201).json({
            success: true,
            message: 'Rider application submitted successfully. Pending admin review.',
            data: {
                userId: user._id,
                applicationId: rider._id,
                approvalStatus: rider.approvalStatus,
            },
        });

    } catch (error) {
        if (error.name === 'ValidationError' && error.errors) {
            const messages = Object.values(error.errors).map(e => e.message).join('. ');
            return res.status(400).json({ message: messages });
        }
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(400).json({ message: `${field} already exists` });
        }
        res.status(500).json({ message: error.message });
    }
}

export const getPendingApplication = async (req, res) => {
    try {
        const applications = await Rider.find({ approvalStatus: 'PENDING' })
            .populate('user', 'name email phone createdAt')
            .sort({ createdAt: -1 });

        res.json({ success: true, count: applications.length, data: applications });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const processRiderApplications = async (req, res) => {
    try {
        const { action, rejectionReason } = req.body;

        if (!action || !['APPROVE', 'REJECT'].includes(action)) {
            return res.status(400).json({ message: 'Action must be APPROVE or REJECT' });
        }

        const rider = await Rider.findById(req.params.riderId);
        if (!rider) {
            return res.status(404).json({ message: 'Rider profile not found' });
        }

        const user = await User.findById(rider.user)
        if (!user) {
            return res.status(404).json({ message: 'Associated user account not found' });
        }

        if (action === 'APPROVE') {
            rider.approvalStatus = 'APPROVED';
            rider.isAvailable = true;
            user.isApproved = true;
        } else if (action === 'REJECT') {
            rider.approvalStatus = 'REJECTED';
            rider.rejectionReason = rejectionReason || 'Document did not meet criteria.';
            rider.isAvailable = false;
            user.isApproved = false;
        }
        await rider.save();
        await user.save();
        res.json({
            success: true,
            message: 'Rider application has been ' + action.toLowerCase() + 'd.',
            data: {
                riderId: rider._id,
                applicationStatus: rider.approvalStatus,
                userApproved: user.isApproved,
            }
        });
    } catch (error) {
        if (error.name === 'ValidationError' && error.errors) {
            const messages = Object.values(error.errors).map(e => e.message).join('. ');
            return res.status(400).json({ message: messages });
        }
        res.status(500).json({ message: error.message });
    }
}

export const getRiderProfile = async (req, res) => {
    try {
        const rider = await Rider.findOne({ user: req.user._id || req.user.id })
            .populate('user', 'name email phone role');
        if (!rider) {
            return res.status(404).json({ message: 'Rider profile not found. Complete rider registration first.' });
        }
        res.json({ success: true, data: rider });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const toggleAvailability = async (req, res) => {
    try {
        const { isAvailable } = req.body || {};
        const rider = await Rider.findOne({ user: req.user._id || req.user.id });
        if (!rider) {
            return res.status(404).json({ message: 'Rider profile not found.' });
        }
        const updatedRider = await riderService.toggleAvailability(req.user._id, isAvailable !== undefined ? isAvailable : !rider.isAvailable);
        res.json({
            success: true,
            message: `Rider is now ${updatedRider.isAvailable ? 'Online' : 'Offline'}`,
            data: updatedRider,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const updateLocation = async (req, res) => {
    try {
        const { longitude, latitude } = req.body;
        if (longitude === undefined || latitude === undefined) {
            return res.status(400).json({ message: 'Longitude and latitude are required' });
        }
        if (isNaN(Number(longitude)) || isNaN(Number(latitude))) {
            return res.status(400).json({ message: 'Longitude and latitude must be valid numbers' });
        }
        let rider = await Rider.findOne({ user: req.user._id });
        if (!rider) {
            return res.status(404).json({ message: 'Rider profile not found.' });
        } else {
            rider.currentLocation = {
                type: 'Point',
                coordinates: [Number(longitude), Number(latitude)],
            };
            await rider.save();
        }
        res.json({
            success: true,
            message: 'Location updated successfully',
            data: rider.currentLocation
        });
    } catch (error) {
        if (error.name === 'ValidationError' && error.errors) {
            const messages = Object.values(error.errors).map(e => e.message).join('. ');
            return res.status(400).json({ message: messages });
        }
        res.status(500).json({ message: error.message });
    }
}
export const NearByRiders = async (req, res) => {
    try {
        const { lng, lat, maxDistance = 5000 } = req.query;
        if (!lng || !lat) {
            return res.status(400).json({ message: 'Query params "lng" and "lat" are required' });
        }
        const riders = await Rider.find({
            isAvailable: true,
            currentLocation: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(lng), parseFloat(lat)],
                    },
                    $maxDistance: parseInt(maxDistance),
                },
            },
        }).populate('user', 'name phone');
        res.json({ success: true, count: riders.length, data: riders });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Toggle Availability (Online/Offline)
// @route   PATCH /api/riders/toggle-online
export const toggleOnlineStatus = async (req, res) => {
    try {
        const { isAvailable } = req.body || {};
        if (isAvailable !== undefined && typeof isAvailable !== 'boolean') {
            return res.status(400).json({ success: false, message: 'isAvailable must be a boolean' });
        }
        const rider = await riderService.toggleAvailability(req.user._id, isAvailable);
        res.json({
            success: true,
            message: `Rider is now ${rider.isAvailable ? 'ONLINE' : 'OFFLINE'}.`,
            data: rider,
        });
    } catch (error) {
        if (error.name === 'ValidationError' && error.errors) {
            const messages = Object.values(error.errors).map(e => e.message).join('. ');
            return res.status(400).json({ success: false, message: messages });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Admin Approve/Reject Application
// @route   PATCH /api/riders/:id/review
export const reviewApplication = async (req, res) => {
    try {
        const { approvalStatus } = req.body;
        if (!approvalStatus || !['APPROVED', 'REJECTED'].includes(approvalStatus)) {
            return res.status(400).json({ success: false, message: 'approvalStatus must be APPROVED or REJECTED' });
        }
        const rider = await riderService.reviewRiderApplication(req.params.id, approvalStatus, req.user._id);
        res.json({ success: true, message: `Application updated to ${approvalStatus}.`, data: rider });
    } catch (error) {
        if (error.name === 'ValidationError' && error.errors) {
            const messages = Object.values(error.errors).map(e => e.message).join('. ');
            return res.status(400).json({ success: false, message: messages });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Admin Deactivate/Activate Rider
// @route   PATCH /api/riders/:id/deactivate
export const deactivateRider = async (req, res) => {
    try {
        const { isDeactivated, reason } = req.body;
        if (isDeactivated === undefined || typeof isDeactivated !== 'boolean') {
            return res.status(400).json({ success: false, message: 'isDeactivated must be a boolean' });
        }
        const rider = await riderService.setRiderDeactivationStatus(req.params.id, isDeactivated, reason);
        res.json({
            success: true,
            message: `Rider account ${isDeactivated ? 'deactivated' : 'reactivated'}.`,
            data: rider,
        });
    } catch (error) {
        if (error.name === 'ValidationError' && error.errors) {
            const messages = Object.values(error.errors).map(e => e.message).join('. ');
            return res.status(400).json({ success: false, message: messages });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Rider Accept Assignment
// @route   POST /api/riders/orders/:orderId/accept
export const acceptOrder = async (req, res) => {
    try {
        const result = await riderService.acceptAssignedOrder(req.params.orderId, req.user._id);
        res.json({ success: true, message: 'Order accepted successfully.', data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Rider Complete Order
// @route   POST /api/riders/orders/:orderId/complete
export const completeOrder = async (req, res) => {
    try {
        const result = await riderService.completeOrderDelivery(req.params.orderId, req.user._id);
        res.json({ success: true, message: 'Order marked as DELIVERED.', data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Rider Reject Assigned Order
// @route   POST /api/riders/orders/:orderId/reject
export const rejectOrder = async (req, res) => {
    try {
        const { reason } = req.body;
        const result = await riderService.rejectAssignedOrder(req.params.orderId, req.user._id, reason);
        res.json({ success: true, message: 'Assignment rejected. Order moved to pool for reassignment.', data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Get Rider Performance Stats
// @route   GET /api/riders/stats
export const getRiderStats = async (req, res) => {
    try {
        const stats = await riderService.getRiderStats(req.user._id);
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};