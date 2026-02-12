FROM ruby:2.7

WORKDIR /app

# Install nodejs (für JS-Builds)
RUN apt-get update && apt-get install -y nodejs npm

# Kopiere den Projektcode
COPY . /app

RUN npm install blob encoding browserify jspdf uglify-js ajv

# Wechsle ins SRC_Zupfnoter-Verzeichnis für Bundler und Start
WORKDIR /app/SRC_Zupfnoter

# Rubygems gezielt auf eine kompatible Version updaten
RUN gem install rubygems-update -v 3.3.26 && \
    update_rubygems

# Installiere Bundler und Gems
RUN gem install bundler -v 2.0.1 && bundle install

# Exponiere Port für den Server
EXPOSE 9292

# Starte den Server
#CMD ["bundle", "exec", "rake", "server"]