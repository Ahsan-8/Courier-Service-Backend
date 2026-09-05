import Rider from "../models/Rider.js";
import User from "../models/User.js";

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

        if (!['APPROVE', 'REJECT'].includes(action)) {
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
            rider.isApproved = true;
            rider.isAvailable = true;
            user.isApproved = true;
        } else if (action === 'REJECT') {
            rider.approvalStatus = 'REJECTED';
            rider.rejectionReason = rejectionReason || 'Document did not meet criteria.';
            rider.isApproved = false;
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
        res.status(500).json({ message: error.message });
    }
}

export const getRiderProfile = async (req, res) => {
    try {
        let rider = await Rider.findOne({ user: req.user._id })
            .populate('user', 'name email phone role');
        if (!rider) {
            rider = await Rider.create({ user: req.user._id });
            rider = await rider.populate('user', 'name email phone role');
        }
        res.json({ success: true, data: rider });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const toggleAvailability = async (req, res) => {
    try {
        const { isAvailable } = req.body;
        let rider = await Rider.findOne({ user: req.user._id });
        if (!rider) {
            rider = await Rider.create({ user: req.user._id, isAvailable });
        } else {
            rider.isAvailable = isAvailable !== undefined ? isAvailable : !rider.isAvailable;
            await rider.save();
        }
        res.json({
            success: true,
            message: `Rider is now ${rider.isAvailable ? 'Online' : 'Offline'}`,
            data: rider,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const updateLocation = async (req, res) => {
    try {
        const { longitude, latitude } = req.body;
        if (longitude === undefined || latitude === undefined) {
            return res.status(404).json({ message: 'Longitude and latitude are required' });
        }
        let rider = await Rider.findOne({ user: req.user._id });
        if (!rider) {
            rider = await Rider.create({
                user: req.user._id,
                currentLocation: { type: 'Point', coordinates: [longitude, latitude] }
            });
        } else {
            rider.currentLocation = {
                type: 'Point',
                coordinates: [longitude, latitude],
            };
            await rider.save();
        }
        res.json({
            success: true,
            message: 'Location updated successfully',
            data: rider.currentLocation
        });
    } catch (error) {
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