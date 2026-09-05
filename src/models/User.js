import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required:true },
        email: { type: String, required:true, unique:true },
        password: { type: String, required:true },
        phone: { type: String, unique:true },
        address: {type: String},
        role: {
            type: String,
            enum: ['CUSTOMER','RIDER','ADMIN'],
            default:'CUSTOMER',
        },
        isApproved: {
            type: Boolean,
            default: true,
        },
    },{timestamps:true}
);

userSchema.pre("save", async function() {
    if(!this.isModified("password")) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function(enteredPassword){
    return await bcrypt.compare(enteredPassword, this.password);
}

export default mongoose.model("User", userSchema);