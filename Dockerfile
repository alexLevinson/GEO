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
  "What is the highest rated luxury car dealer in San Francisco?"\
  "Best price luxury car dealer SF"\
  "Where is the most reliable luxury car dealer in the bay area?"\
  "What luxury car dealership in the SF bay area has the best servicing?"\
  "Which luxury car dealer has the best pricing after tariffs in San Francisco?"\
  "Which luxury car dealership has the best financing in the bay area?"\
  "What is the best car dealership in the bay area?"\
  "What is the best car dealership in San Francisco?"\
  "Im looking the buy a car, I live in the bay area, where is a good place to go?"\
  "Where can I get the best deal on a car in the bay area?"\
  "What is the highest rated car dealer in San Francisco?"\
  "Best price car dealer SF"\
  "Where is the most reliable car dealer in the bay area?"\
  "What car dealership in the SF bay area has the best servicing?"\
  "Which car dealer has the best pricing after tariffs in San Francisco?"\
  "Which car dealership has the best financing in the bay area?"\
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
