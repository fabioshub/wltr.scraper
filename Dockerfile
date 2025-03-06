FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install
RUN npm install -g tsx typescript@5.3.3 @types/node

# Copy source files
COPY . .

# Create tsconfig.json for TypeScript compilation
RUN echo '{"compilerOptions":{"target":"ES2020","module":"ESNext","moduleResolution":"bundler","esModuleInterop":true,"allowSyntheticDefaultImports":true,"strict":true,"skipLibCheck":true,"outDir":"./dist","rootDir":".","types":["node"]}}' > tsconfig.json

# Expose the server port
EXPOSE 4444

# Default command
CMD ["node", "server.js"] 