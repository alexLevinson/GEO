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

# Create a shell script to run simulation.js 50 times
RUN echo '#!/bin/bash\nfor i in {1..50}; do\n  echo "Running simulation $i of 50"\n  node simulation.js\n  echo "Completed simulation $i of 50"\n  echo "------------------------"\ndone' > run_simulations.sh && \
  chmod +x run_simulations.sh

# Run the script 50 times sequentially
CMD ["./run_simulations.sh"]