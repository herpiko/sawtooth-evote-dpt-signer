FROM ubuntu:16.04
RUN apt-get update
RUN apt-get install -y software-properties-common python-software-properties curl iputils-ping git vim build-essential 
RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs

COPY ./ .
RUN echo "node index.js province-dpt-34:11334" >> /bin/server
RUN chmod +x /bin/server

CMD ["bash", "-c", "/bin/server"]
