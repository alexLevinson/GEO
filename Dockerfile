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
  "What is the best Merdes-Benz dealership in the bay area?"\
  "What is the best Merdes-Benz dealership in San Francisco?"\
  "Im looking the buy a Mercedes, I live in the bay area, where is a good place to go?"\
  "Where can I get the best deal on a Mercedes in the bay area?"\
  "What is the highest rated Mercedes dealer in San Francisco?"\
  "Best price Mercedes delaer SF"\
  "Where is the most reliable Mercedes dealer in the bay area?"\
  "What Mercedes dealership in the SF bay area has the best servicing?"\
  "Which Mercedes dealer has the best pricing after tariffs in San Francisco?"\
  "Which Mercedes dealership has the best financing in the bay area?"\
  )\n\
  for query in "${QUERIES[@]}"; do\n\
  echo "Processing query: $query"\n\
  for i in {1..50}; do\n\
  echo "Running simulation $i of 50 for query: $query"\n\
  QUERY="$query" node simulation.js\n\
  echo "Completed simulation $i of 50"\n\
  echo "------------------------"\n\
  done\n\
  done' > run_simulations.sh && \
  chmod +x run_simulations.sh

# Run the script with all queries
CMD ["./run_simulations.sh"]