import 'dotenv/config';
// import { config, createSchema } from '@keystone-next/keystone/schema';

const databaseURL = process.env.PRISMA_ENDPOINT;

const sessionConfig = {
  maxAge: 60 * 60 * 24 * 360, // How long they stay signed in
  secret: 'fdsklva'
}

export default config({
  server: {
    cors: {
      origin: [process.env.FRONTEND_URL],
      credentials: true
    }
  },
  db: {
    adapter: 'mongoose',
    url: databaseURL,
    // TODO add data seeding here
  },
  lists: createSchema({
    // Schema items go in here
  }),
  ui: {
    // TODO change it for roles
    isAccessAllowed: () => true,
  },
  // TODO add session values here
});
