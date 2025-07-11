#根据nodejs的版本选择抖音云语言基础镜像
FROM public-cn-beijing.cr.volces.com/public/dycloud-node:18-alpine
#指定项目根目录
WORKDIR /opt/application/

# copy 
COPY . .

USER root

# 安装相关依赖
RUN npm install --registry=https://registry.npmmirror.com 

# 如果是TS, 需要额外编译一次
RUN if [ $(ls /opt/application | grep -w tsconfig.json | wc -l ) = 1 ]; then npm run build; fi

# 写入run.sh
RUN echo -e '#!/usr/bin/env bash\ncd /opt/application/ && npm run start:enhanced' > /opt/application/run.sh

# 指定run.sh权限
RUN chmod a+x run.sh

EXPOSE 8080

# 启动应用
CMD ["/bin/sh", "/opt/application/run.sh"]