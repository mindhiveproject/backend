// here the server starts (entry point of the application)
// environment variables (to store the frontend url, prisma endpoint, prisma and app secret keys, and the port number)
require('dotenv').config({ path: 'variables.env' })

const createServer = require('./createServer')
const db = require('./db')

const server = createServer()

// TODO use express middleware to use cookies (JWT)

// TODO use express middleware to populate current user

server.start({
  cors: {
    credentials: true,
    origins: process.env.FRONTEND_URL
  }
}, deets => {
  console.log(`Server is running on port http://localhost:${deets.port}`)
})
