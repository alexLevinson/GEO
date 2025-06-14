FROM mcr.microsoft.com/playwright:v1.42.1-focal

LABEL Name="geo-simulation" \
  Version="1.0.0" \
  Maintainer="alex.levinson13@gmail.com"
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Run the script
CMD ["node", "simulation.js"]