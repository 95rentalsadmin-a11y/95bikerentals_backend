# 95 Bike Rentals Backend

Node.js/TypeScript backend API for the 95 Bike Rentals application.

## Features

- Bike management (CRUD operations)
- Booking system with availability checking
- Rate calculation based on duration
- SQLite database for data persistence
- RESTful API endpoints

## Tech Stack

- Node.js
- TypeScript
- Express.js
- SQLite (better-sqlite3)
- CORS

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
The `.env` file is already configured with default values:
```
PORT=5000
NODE_ENV=development
```

## Running the Server

Development mode (with hot reload):
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

## API Endpoints

### Bikes

- `GET /api/bikes` - Get all available bikes
- `GET /api/bikes/:id` - Get a specific bike by ID
- `PATCH /api/bikes/:id/availability` - Update bike availability

### Bookings

- `POST /api/bookings` - Create a new booking
- `GET /api/bookings/:id` - Get booking by ID
- `GET /api/bookings/phone/:phone` - Get bookings by phone number
- `PATCH /api/bookings/:id/cancel` - Cancel a booking
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

The application uses SQLite database (`rentals.db`) which is automatically created on first run. The database includes:

- **bikes table**: Stores bike information with rates and availability
- **bookings table**: Stores booking details and status

The database is automatically seeded with 5 bikes on first startup.

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
