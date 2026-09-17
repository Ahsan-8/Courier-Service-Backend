import { resolveZone, TARIFF_MATRIX, ZONES } from '../constants/zonesConstants.js';

export class PricingEngine {
  static calculate(parcel = {}, originAddress = {}, destinationAddress = {}, orderContext = {}) {
    const { actualWeight = 0, dimensions = {} } = parcel;
    const { length = 0, width = 0, height = 0 } = dimensions;
    const {
      category = 'Standard',
      paymentMethod = 'COD',
      codAmountRequested = 0,
      codAmountCollected = 0,
      status = 'DELIVERED',
      isSameDay = false,
    } = orderContext;

    // 1. Resolve Tariff
    const zone = resolveZone(originAddress.district, destinationAddress.district);
    const tariff = TARIFF_MATRIX[zone];

    // 2. Volumetric Weight Calculation
    const volumetricWeight = (length * width * height) / 5000;
    const rawBillable = Math.max(actualWeight, volumetricWeight);
    // Enforce minimum floor of 0.1 kg so manifests never report 0
    const billableWeight = rawBillable <= 0 ? 0.1 : rawBillable;

    // 3. Base Fee Calculation
    let baseAndDistanceFee = tariff.basePrice;

    if (isSameDay && tariff.sameDayPrice) {
      baseAndDistanceFee = tariff.sameDayPrice;
    }

    if (category === 'Book') {
      baseAndDistanceFee = Math.max(55, baseAndDistanceFee - 20); // Floor protection
    }

    // 4. Incremental Weight Surcharge
    let weightSurcharge = 0;
    if (billableWeight > tariff.baseWeightLimitKg) {
      const extraWeight = Math.ceil(billableWeight - tariff.baseWeightLimitKg);
      weightSurcharge = extraWeight * tariff.weightSurchargePerKg;
    }

    // 5. Lifecycle Financial Logic
    let finalCodFee = 0;
    let returnHandlingFee = 0;
    let collectedCash = 0;

    if (status === 'DELIVERED') {
      collectedCash = paymentMethod === 'COD' ? codAmountRequested : 0;
      if (paymentMethod === 'COD' && collectedCash > 0) {
        finalCodFee = collectedCash * (tariff.codPercentage / 100);
      }
    } else if (status === 'PARTIAL_DELIVERY') {
      collectedCash = codAmountCollected;
      if (collectedCash > 0) {
        finalCodFee = collectedCash * (tariff.codPercentage / 100);
      }
    } else if (status === 'RETURNED') {
      collectedCash = 0;
      finalCodFee = 0;
      returnHandlingFee = baseAndDistanceFee * 0.5; // 50% RTO charge
    }

    // 6. Final Consolidation & Ledger Balancing
    const totalDeliveryFee = baseAndDistanceFee + weightSurcharge + finalCodFee + returnHandlingFee;

    // Allows negative balance so merchant account correctly registers debt on returns
    const netPayableToMerchant = collectedCash - totalDeliveryFee;

    return {
      zone,
      billableWeightKg: Number(billableWeight.toFixed(2)),
      isVolumetricApplied: volumetricWeight > actualWeight,
      breakdown: {
        baseAndDistanceFee: Number(baseAndDistanceFee.toFixed(2)),
        weightSurcharge: Number(weightSurcharge.toFixed(2)),
        codFee: Number(finalCodFee.toFixed(2)),
        returnHandlingFee: Number(returnHandlingFee.toFixed(2)),
        totalDeliveryFee: Number(totalDeliveryFee.toFixed(2)),
      },
      merchantLedger: {
        collectedCash: Number(collectedCash.toFixed(2)),
        deductedDeliveryFee: Number(totalDeliveryFee.toFixed(2)),
        netPayableToMerchant: Number(netPayableToMerchant.toFixed(2)),
      },
    };
  }
}