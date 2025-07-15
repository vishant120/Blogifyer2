

# Use Node.js 20 (alpine for smaller image size)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if exists)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Create uploads directory for multer
RUN mkdir -p public/uploads
RUN mkdir -p public/images

# Expose port
EXPOSE 8000

# Start the application
CMD ["npm", "start"]

