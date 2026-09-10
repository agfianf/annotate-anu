# Stage 1: Development
FROM node:22 AS development

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

# Copy app files. Without this the dev image has no application code and only
# works when docker-compose bind-mounts the source over /app. Baking it in makes
# the default run self-contained; mount the source in an override for hot-reload.
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Start dev server (will be overridden by docker-compose command)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Stage 2: Build the application
FROM node:22 AS builder

WORKDIR /app

# Build arguments for environment variables
# These defaults can be overridden via docker-compose build args
ARG VITE_SAM3_API_URL=http://localhost:18710
ARG VITE_CORE_API_URL=http://localhost:18711
ARG VITE_ENV=production

# Set environment variables from build args
ENV VITE_SAM3_API_URL=$VITE_SAM3_API_URL
ENV VITE_CORE_API_URL=$VITE_CORE_API_URL
ENV VITE_ENV=$VITE_ENV

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy app files
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
