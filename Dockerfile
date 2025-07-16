# Use Node.js 20 (alpine for smaller image size)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if exists)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your application code
COPY . .

# If you have static images, keep these; otherwise, you can remove them
RUN mkdir -p public/images

# Expose the port your app runs on
EXPOSE 8000

# Start the application
CMD ["npm", "start"]
