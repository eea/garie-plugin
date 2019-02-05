FROM node:8.10.0

RUN mkdir -p /usr/src/<my_garie_plugin>
RUN mkdir -p /usr/src/<my_garie_plugin>/reports

WORKDIR /usr/src/<my_garie_plugin>

COPY package.json .

RUN cd /usr/src/<my_garie_plugin> && npm install

COPY . .

EXPOSE 3000

VOLUME ["/usr/src/<my_garie_plugin>/reports"]

ENTRYPOINT ["/usr/src/<my_garie_plugin>/docker-entrypoint.sh"]

CMD ["npm", "start"]