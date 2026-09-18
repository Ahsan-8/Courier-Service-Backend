import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
    let token;
    if(req.headers.authorization && req.headers.authorization.startsWith("Bearer")){
        try{
            token = req.headers.authorization.split(" ")[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.id || decoded.userId;
            req.user = await User.findById(userId).select("-password");
            if(!req.user){
                return res.status(401).json({message:"User not found"});
            }
            return next();
        }catch (error){
            console.error("JWT Verification Error:",error.message);
            return res.status(401).json({message:"Not authorized, token failed"});
        }
    }
    return res.status(401).json({message:"Not authorized, no token"});
}