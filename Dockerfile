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

# Create a shell script to run simulation.js 50 times for each query
RUN echo '#!/bin/bash\n\
  QUERIES=(\
  "What is the best Mercedes-Benz dealership in the bay area?"\
  )\n\
  for query in "${QUERIES[@]}"; do\n\
  echo "Processing query: $query"\n\
  for i in {1..3}; do\n\
  echo "Running simulation $i of 3 for query: $query"\n\
  QUERY="$query" node simulation.js\n\
  echo "Completed simulation $i of 3"\n\
  echo "------------------------"\n\
  done\n\
  done' > run_simulations.sh && \
  chmod +x run_simulations.sh

# Run the script with all queries
CMD ["./run_simulations.sh"]
