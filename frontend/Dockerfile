# Stage 1: Development
FROM node:20 AS development

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*


# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Expose Vite dev server port
EXPOSE 5173

# Start dev server (will be overridden by docker-compose command)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Stage 2: Build the application
FROM node:20 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 3: Production - Serve with Nginx
FROM nginx:alpine AS production

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
