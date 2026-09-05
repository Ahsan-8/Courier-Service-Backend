import User from "../models/User.js";
import Rider from "../models/Rider.js";
import jwt from "jsonwebtoken";

const generateToken = (user) => {
    return jwt.sign({id: user.id, role: user.role}, process.env.JWT_SECRET, { expiresIn: "7d", });
}

export const register = async (req,res) =>{
    try{
        const {name, email, phone, password, role} = req.body;
        const userExists = await User.findOne({ $or: [{ email }, { phone }] });
        if(userExists){
            return res.status(400).json({message:"User with this email or phone number already exists"});
        }
        const user = await User.create({name, email, phone, password, role: role || "CUSTOMER"});

        const token = generateToken(user);
        res.status(201).json({
            success:true,
            data:{
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                token,
            },
        });
    }catch (error){
        res.status(500).json({message: error.message});
    }
};

export const login = async (req, res) => {
    try {
        const {email, password} = req.body;
        const user = await User.findOne({email}).select("+password");
        if(!user){
            return res.status(401).json({message:"User not found!"});
        }
        const isMatch = await user.comparePassword(password);
        if(!isMatch){
            return res.status(401).json({message:"Password not matched"})
        }
        if(user.role === 'RIDER' && !user.isApproved){
            const rider = await Rider.findOne({user: user._id});
            if(rider && rider.approvalStatus === 'REJECTED'){
                return res.status(403).json({message: `Application Rejected: ${rider.rejectionReason || 'Contact support.'}`,})
            }
            return res.status(403).json({message: `Your rider account is pending admin approval. Please wait for verification.`})
        }


        const token = generateToken(user);

        res.status(200).json({
            success:true,
            data:{
                _id:user._id,
                name:user.name,
                email:user.email,
                phone:user.phone,
                role:user.role,
                token,
            },
        });
    }catch (error){
        res.status(500).json({message:error.message});
    }
}