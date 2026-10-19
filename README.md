# 95 Bike Rentals Backend

Node.js/TypeScript backend API for the 95 Bike Rentals application.

## Features

- Bike management (CRUD operations)
- Booking system with availability checking
- Rate calculation based on duration
- PostgreSQL database managed with Prisma migrations
- RESTful API endpoints

## Tech Stack

- Node.js
- TypeScript
- Express.js
- PostgreSQL + Prisma
- CORS
- Razorpay payments and refunds
- Firebase customer authentication
- S3-compatible image and ID-proof storage

## Installation

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
The `.env` file is already configured with default values:
```
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://...
JWT_SECRET=replace-me
```

## Running the Server

Development mode (with hot reload):
```bash
pnpm dev
```

Production mode:
```bash
pnpm build
pnpm start
```

## API Endpoints

### Bikes

- `GET /api/bikes` - Get all available bikes
- `GET /api/bikes/:id` - Get a specific bike by ID
- Bike availability updates are admin-only at `PATCH /api/admin/bikes/:id/availability`

### Bookings

- `POST /api/bookings` - Create a booking (customer authentication required)
- `GET /api/bookings/:id` - Get a booking (owner authentication required)
- `GET /api/bookings/me` - Get the authenticated customer's bookings
- `PATCH /api/bookings/:id/cancel` - Cancel a booking and apply the refund policy
- `POST /api/bookings/check-availability` - Check bike availability for dates
- `POST /api/bookings/calculate-rate` - Calculate rental rate

## API Examples

### Get all bikes
```bash
curl http://localhost:5000/api/bikes
```

### Create a booking
```bash
curl -X POST http://localhost:5000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "bikeId": "1",
    "customerName": "John Doe",
    "customerPhone": "1234567890",
    "customerEmail": "john@example.com",
    "customerAddress": "123 Main St",
    "idProof": "A1234567",
    "startDate": "2024-01-15",
    "endDate": "2024-01-16",
    "startTime": "10:00 AM",
    "endTime": "10:00 AM",
    "calculatedRate": 580,
    "durationHours": 24
  }'
```

### Check availability
```bash
curl -X POST http://localhost:5000/api/bookings/check-availability \
  -H "Content-Type: application/json" \
  -d '{
    "bikeId": "1",
    "startDate": "2024-01-15",
    "endDate": "2024-01-16",
    "startTime": "10:00 AM",
    "endTime": "10:00 AM"
  }'
```

### Calculate rate
```bash
curl -X POST http://localhost:5000/api/bookings/calculate-rate \
  -H "Content-Type: application/json" \
  -d '{
    "bikeId": "1",
    "durationHours": 24
  }'
```

## Database

The application uses PostgreSQL. Run migrations before starting production:

```bash
pnpm prisma migrate deploy
```

The server seeds the five starter bikes when the bike table is empty. Package pricing is backfilled by the package-pricing migration.

## Project Structure

```
95bikerentals_backend/
├── src/
│   ├── controllers/       # Route controllers
│   │   ├── bikeController.ts
│   │   └── bookingController.ts
│   ├── database/          # Database configuration
│   │   └── database.ts
│   ├── routes/            # API routes
│   │   ├── bikeRoutes.ts
│   │   └── bookingRoutes.ts
│   ├── types/             # TypeScript types
│   │   └── index.ts
│   └── server.ts          # Express server setup
├── .env                   # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## Rate Calculation Logic

- Up to 12 hours: 12-hour rate
- Up to 24 hours: 24-hour rate
- More than 24 hours: 24-hour rate + (extra hours × hourly rate)
