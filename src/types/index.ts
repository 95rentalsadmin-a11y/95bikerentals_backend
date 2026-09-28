export interface Bike {
  id: string;
  name: string;
  image: string;
  features: string[];
  baseRatePerHour: number;
  baseRate12Hours: number;
  baseRate24Hours: number;
  category: 'scooter' | 'motorcycle' | 'electric';
  available: boolean;
}

export interface Booking {
  id: string;
  bikeId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  idProof: string;
  idProofFilePath?: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  calculatedRate: number;
  durationHours: number;
  securityDeposit: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded' | 'cash' | 'whatsapp';
  paymentMethod?: string | null;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AvailabilityCheck {
  bikeId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}
