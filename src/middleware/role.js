export const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if(!req.user){
            return res.status(401).json({message:"Not authorized, user not found"});
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
              message: `Forbidden: Access restricted to [${roles.join(', ')}] role(s). Your role is '${req.user.role}'.`
            });
        }
        next();
    }
}