# Frontend container: Node 20 LTS running Vite's dev server.
#
# For development we use `npm run dev` so code changes hot-reload.
# For production you'd replace this with a multi-stage build that compiles
# the app with `npm run build` and serves it via nginx.

FROM node:20-alpine

WORKDIR /app

# Install dependencies first (so this layer is cached when only code changes)
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the source
COPY . .

EXPOSE 5173

# Vite's dev server; --host 0.0.0.0 is required so Docker port forwarding works
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]