-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "razorpayOrderId" TEXT,
ADD COLUMN     "razorpayPaymentId" TEXT,
ADD COLUMN     "razorpaySignature" TEXT,
ADD COLUMN     "securityDeposit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Booking_customerPhone_idx" ON "Booking"("customerPhone");

-- CreateIndex
CREATE INDEX "Booking_bikeId_idx" ON "Booking"("bikeId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");
