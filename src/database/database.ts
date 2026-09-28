import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

const bikesSeed = [
  {
    id: '1',
    name: 'Honda Shine 100 BS6',
    image: '/images/shine_100.jpg',
    features: JSON.stringify(['100cc Engine', 'Fuel Efficient', 'Comfortable Ride', 'Disc Brake']),
    baseRatePerHour: 50,
    baseRate12Hours: 425,
    baseRate24Hours: 580,
    category: 'motorcycle',
    available: true
  },
  {
    id: '2',
    name: 'Honda Activa BS6',
    image: '/images/activa_6g.png',
    features: JSON.stringify(['110cc Engine', 'Automatic', 'Storage Space', 'Telescopic Suspension']),
    baseRatePerHour: 50,
    baseRate12Hours: 425,
    baseRate24Hours: 580,
    category: 'scooter',
    available: true
  },
  {
    id: '3',
    name: 'Yamaha Fascino BS6',
    image: '/images/fascino.jpeg',
    features: JSON.stringify(['125cc Engine', 'Stylish Design', 'Lightweight', 'USB Charging']),
    baseRatePerHour: 50,
    baseRate12Hours: 425,
    baseRate24Hours: 580,
    category: 'scooter',
    available: true
  },
  {
    id: '4',
    name: 'Hero Destini BS6 Xtec',
    image: '/images/destini.jpeg',
    features: JSON.stringify(['125cc Engine', 'Digital Console', 'Mobile Charging', 'External Fuel Fill']),
    baseRatePerHour: 50,
    baseRate12Hours: 425,
    baseRate24Hours: 580,
    category: 'scooter',
    available: true
  },
  {
    id: '5',
    name: 'Aether 450X',
    image: '/images/aether.jpeg',
    features: JSON.stringify(['Electric', 'Fast Charging', 'Zero Emissions', 'Smart Connectivity']),
    baseRatePerHour: 75,
    baseRate12Hours: 600,
    baseRate24Hours: 800,
    category: 'electric',
    available: true
  }
];

export const initializeDatabase = async () => {
  try {
    // Seed bikes if table is empty
    const bikeCount = await prisma.bike.count();

    if (bikeCount === 0) {
      await prisma.bike.createMany({
        data: bikesSeed
      });
      console.log('Seeded bikes database');
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

export default prisma;
