export const calculateDeliveryFee = (weightKG, category) => {
    const baseFee = 50;
    const perKgRate = 10;
    let fee = baseFee + (weightKG * perKgRate);
    
    switch (category) {
        case 'DOCUMENTS':
            fee += 20;
            break;
        case 'FRAGILE':
            fee += 150; 
            break;
        case 'ELECTRONICS':
            fee += 30;
            break;
        case 'CLOTHING':
            fee += 10;
            break;
        case 'HEAVY':
            fee += 100;
            break;
        case 'PARCEL':
            fee += 15;
            break;
        default:
            throw new Error('Invalid category');
    }
    
    return fee;
}