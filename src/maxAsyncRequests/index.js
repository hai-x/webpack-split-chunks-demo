// import bigFile from '30KB'
// import common from 'common'
// console.log(bigFile);
// console.log(common);

import(
  /* webpackChunkName:
"async-a" */ './a'
)
import(
  /* webpackChunkName:
"async-b" */ './b'
)
import(
  /* webpackChunkName:
"async-c" */ './c'
)
