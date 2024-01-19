> 本文将展开分析 webpack 内的优化项 SplitChunks, 注意 SplitChunks 和 Code
> Splitting 有所不同, 常说的 Code Splitting 一般指代码分割, 通过 动态导入
> dynamic import() 实现。

希望读者们能在阅读后学到东西, 同时 遇到疏漏/问题, 也请进行指正。

相关代码:
[github/webpack-split-chunks-demo](https://github.com/haijie-x/webpack-split-chunks-demo)

### 名词解释

- Chunk: 由 modules 集合 + modules 加载后会执行的方法 组成 , 可理解为 构建输出的
  js 产物。
  `Each chunk has a corresponding asset. The assets are the output files - the result of bundling.`

  chunk 如何产生？

  Entry Points (webpack config entry 配置项)

  ```
  // webpack.config.js
  module.exports = {
    entry: './path/to/my/entry/file.js',
  };
  ```

  动态导入语句

  ```
  import('./path/to/my/entry/file.js')
  ```

  chunk 如何执行？

  ```
  // 模拟下 module system 里的 jsonp 方法, jsonp 具体做 缓存模块 + 执行模块
  // require 等实现不做展开
  window.mock_jsonp(
      // chunk id
      "0",
      // chunk 包含的模块集合
      {
          0: (module, exports, require) => {
              console.log(`entry module`);
          },
      },
      // 执行 mock_jsonp 方法时, 将执行该函数
      (require) => {
          require(0);
      }
  );
  ```

- SplitChunks: 中文为 拆分 chunks, 拆分前 chunk-1 到 拆分后 chunk-1-1,
  chunk-1-2…

  大多数情况下 chunks 的拆分 意味着 modules 的合并, 所以对 chunks 进行拆分 与
  module 的关系密不可分。

### 用途

随着业务规模/复杂度上升, Webapp 项目的体积也越来越大, 对于用户而言, 页面首屏加载
速度尤为关键, 加载依赖网络, 开发者需要构建出一个适配不同网络情况/业务特性的应用
产物。

对于一些不支持 http2 的应用, 我们需限制首屏最大并行请求数量。但对于支持 http2 的
应用, 我们需充分发挥多路复用的特性。

对于用户流量大 & 需求经常迭代变更的应用, 每次发版, 相关改动的 bundle 都将变成冷
资源, 热起来需一段时间, 故需「擅用缓存」, 从构建层面, 开发者可以辅助用户「使用缓
存」, 如 chunkHash/contentHash, hashModule, 将不经常变更三方依赖抽离成单独的
vendor chunk, 将 体积较大的三方依赖 & 几乎不变更的依赖 (react/react-dom 等)做
external。

### 常用配置项

1. chunks : 规定了什么类型的 chunk 将被拆分, 可选 all , initial, async, 其中
   initial 由 EntryPoints 产生, async 由 dyn import() 产生, all 则表示所有 chunk
   都可被拆分。

2. name: 规定拆分后的 chunk 的名称。应避免使用常量字符串 or 返回相同的字符串, 若
   cacheGroup 未指定 name , 这将导致不同的 cacheGroup 使用相同 name, 最终导致所
   有模块合并到 同一个 chunk 中。

3. maxAsyncRequests: 动态加载 最大的并行请求数。

4. maxInitialRequests: 首屏加载 最大的并行请求数。

5. minChunks: 规定了拆分前的模块至少存在几个 chunk 内。

6. minSize: 规定了拆分后的 chunk 最小体积。

7. maxSize: 规定了拆分后的 chunk 最大体积, 该规则可能会被打破（为何会被打破, 下
   文分析会讲解）。

8. cacheGroup: 定义单个 chunk 的拆分规则, 会继承, 覆盖 splitChunks.\* 的任何选项
   , 额外多出 test, priority 和 reuseExistingChunk 属性。

9. test: 模块匹配规则

10. priority: 组别优先级, 如开发者新增一个组别来匹配 node_modules 里具体的某些模
    块, 同时 webpack 内部有 vender 组别, 开发者可通过 priority 属性提升优先级进
    行拆分。

11. reuseExistingChunk: 是否复用已有 chunk, splitChunks 默认行为是通过
    addChunk() 新增 chunk, 若拆分出的 chunk 的模块集合 === 已有 chunk 的模块集合
    , 则不新增, 相当于 「拆了个寂寞」。

### 如何配置

选择默认配置是为了适应 Web 性能最佳实践, 但您的项目的最佳策略可能有所不同。如果
您要更改配置, 则应该衡量更改的效果, 以确保带来真正的好处。

- 默认预设

1. webpack 4:
   https://v4.webpack.js.org/plugins/split-chunks-plugin/#optimizationsplitchunks
2. webpack 5:
   https://webpack.js.org/plugins/split-chunks-plugin/#optimizationsplitchunks
3. [nextjs](https://github.com/vercel/next.js/blob/f85d3af12d693ebed85f511f8b9f1484a71e75f0/packages/next/src/build/webpack-config.ts#L901])

### 思考

- 拆分 chunks 由构建工具完成, 这在用户侧是如何表现的？

  ```
  // main.js
  import(/* webpackChunkName:
  "async-a" */'./a')

  // a.js
  import bigFile from '30KB'
  console.log(bigFile);

  // 30KB.js
  // ...
  // 30KB 字符串, 这里不展开
  ```

  **使用 webpack 默认配置, 会将 node_modules 的模块拆分到新 chunk 内。**

  构建产物如下

  - async-a.chunk.js
  - main.js
  - vendors~async-a.chunk.js

  ```
  // main.js

  // ...
  Promise.all(/* import() | async-a */[__webpack_require__.e(0), __webpack_require__.e(1)]).then(__webpack_require__.bind(null, 1))
  // ...
  ```

  webpack_require.e 内部维护了一个 chunkId -> url 的 map 来动态加载 script 脚本,
  函数返回一个 Promise , 这里不做具体展开。

  源码中对 async-a 模块的加载执行, 被编译为同时加载 2 个 chunk（async-a +
  vendor）后 执行 async-a 模块。

  **如何确保「拆分」不影响原有的 chunkGraph 各个 chunk 节点关系？**

  - webpack4 之前 「父 chunk → 子 chunk 」关系
  - webpack4 及之后「父 chunkGroup(chunks 集合) → 子 chunkGroup(chunks 集合) 」
    关系

  **为什么要对数据结构进行优化？采用 chunksGroup, 而不是 chunk?**

  - 如果 依赖关系是 chunk-a → chunk-b（chunk b 依赖 chunk a）, 从 chunk-a 拆分出
    chunk-a-a。此时将面临一个问题: chunk-a-a 该作为 chunk-a 的父还是子？父子关系
    意味着模块加载的顺序, 比如 「chunk-a 的加载 依赖着 chunk-a-a 的加载」, 两者
    都将导致额外的性能开销, 即 并行加载 变成 串行加载。

    简单代码解释: `load(chunk-a).then(()⇒{load(chunk-a-a)})`

  - 如果 依赖关系为 chunkGroup-a → chunkGroup-b（chunkGroup-b 依赖
    chunkGroup-a）, 此时从 chunk-a 拆分出 chunk-a-a, 并不影响 chunkGroup 的依赖
    关系, 要做的只是往 chunk-a 所在的 chunkGroup.chunks 数组 push 进
    chunk-a-a。chunkGroup.chunks 里的每个 chunk 仍并行加载。

    简单代码解释: `chunkGroup.chunks.forEach(load)`

  **可见, 上文思考提到的内容, async-a + vendor 同属于 一个 chunkGroup。**

  ```
  // lib/RuntimeTemplate.js
  blockPromise({ block, message }) {
      // ...
      const chunks = block.chunkGroup.chunks.filter(
              chunk => !chunk.hasRuntime() && chunk.id !== null
      );
      // ...
      if (chunks.length === 1) {
              const chunkId = JSON.stringify(chunks[0].id);
              return `__webpack_require__.e(${comment}${chunkId})`;
      } else if (chunks.length > 0) {
              const requireChunkId = chunk =>
                      `__webpack_require__.e(${JSON.stringify(chunk.id)})`;
              return `Promise.all(${comment.trim()}[${chunks
                      .map(requireChunkId)
                      .join(", ")}])`;
      } else {
              return `Promise.resolve(${comment.trim()})`;
      }
  }
  ```

  > https://medium.com/webpack/webpack-4-code-splitting-chunk-graph-and-the-splitchunks-optimization-be739a861366

### 前置了解

1.  功能的输入和输出都为 chunks, 输入的 chunks 是基于模块依赖关系初步形成的。
2.  一个模块可能命中多个 cacheGroups, 最终通过 priority , test 等属性, 决定模块
    处于哪个 cacheGroups 中, 即模块被拆分到 哪个 chunk 中。
3.  单个 module 实例 记录了其所在的所有 chunks 集合。
4.  单个 chunk 实例 记录了其包含的所有 module 集合与 其所在的所有 chunkGroups 集
    合。

### 简略设计

思考一下 如果目标是 「将命中 `splitChunks.cacheGroups.{cacheGroup}.test` 的模块
都抽离到 新 chunk 内」, 我们需要怎么做？

1.  首先, 找到 所有匹配中的模块, 并依次找到 模块所在的 chunks 集合, 若模块被复用
    , 则 chunks 长度 大于等于 1。（以下的 chunks 指 模块所在的 chunks 集合）
2.  判断 chunks 的长度是否 大于等于 minChunk, 若不满足, 则过滤该模块（表示 <
    minChunk 的 chunk 数量 依赖此模块）。
3.  判断 剩余模块的总体积 是否 大于等于 minSize, 若不满足, 则退出功能。
4.  判断 是否能复用已有 chunk（判断依据为 是否存在一个 chunk 包含所有剩余模块）,
    若不满足, 则后续会新增 chunk, 否则复用 chunk（即新 chunk 为自身）。
5.  判断 每个 chunk 实例所在的每个 chunkGroups 中的 chunks[] 数量 是否有 <
    maxRequest, 若不满足, 则过滤该 chunk（表示 存在某个 import/entry 会导致 大于
    等于 maxRequest 的 js 请求数）。（以下的 chunkGroups 指 chunk 实例所在的
    chunkGroups 集合）
6.  再次判断 chunks 的长度是否 大于等于 minChunk, 若不满足, 则过滤该模块。
7.  遍历剩余模块: 模块所在 chunk 实例中 记录的模块集合中, 删除模块自身, 同时向所
    在的 chunkGroups 中添加 新 chunk, 并向 新 chunk 添加该模块。
8.  判断 chunk 的总体积 是否 < maxSize, 若不满足, 则对 新 chunk 进行拆分。
9.  至此所有拆分规则皆满足, 且 新 chunk 已存在。

### 深入源码

让我们深入下 webpack （v4.44.2）如何实现 splitChunks 功能？

```
// lib/optimize/SplitChunksPlugin.js
module.exports = class SplitChunksPlugin {
	apply(compiler) {
		compiler.hooks.thisCompilation.tap("SplitChunksPlugin", compilation => {
			let alreadyOptimized = false;
			compilation.hooks.unseal.tap("SplitChunksPlugin", () => {
				alreadyOptimized = false;
			});
			compilation.hooks.optimizeChunksAdvanced.tap(
				"SplitChunksPlugin",
				chunks => {
					// ...
			    }
            )
    })}
}
```

向 optimizeChunksAdvanced 事件钩子注册事件, 并接收到初步形成的 chunks。设立标志
位 alreadyOptimized 避免重复执行功能, 除非编译阶段接收到新模块。

```
const indexMap = new Map();
let index = 1;
for (const chunk of chunks) {
	indexMap.set(chunk, index++);
}
const chunkSetsInGraph = new Map();
for (const module of compilation.modules) {
	const chunksKey = getKey(module.chunksIterable);
	if (!chunkSetsInGraph.has(chunksKey)) {
		chunkSetsInGraph.set(chunksKey, new Set(module.chunksIterable));
	}
}
const chunkSetsByCount = new Map();
for (const chunksSet of chunkSetsInGraph.values()) {
	const count = chunksSet.size;
	let array = chunkSetsByCount.get(count);
	if (array === undefined) {
		array = [];
		chunkSetsByCount.set(count, array);
	}
	array.push(chunksSet);
}
```

初始化 三个数据结构 indexMap / chunkSetsInGraph / chunkSetsByCount

- indexMap 维护 chunk 到 index 的映射。 `{ chunk-a ⇒ 0, chunk-b ⇒ 1, … }`

- chunkSetsInGraph 维护 chunksKey 到 chunks 集合 的映射。chunk 集合 指 模块所在
  的所有 chunks 集合。如 module-a 被 chunk-a, chunk-b, chunk-c 依赖, 则 module-a
  的 chunks 集合为 [chunk-a, chunk-b, chunk-c] , chunksKey 由 这些 chunk 对应的
  index 拼接而成。

  补充: ”module-a 被 chunk-a, chunk-b, chunk-c 依赖” 可能有些难懂, 以下模拟过程
  简单解释下。

  ```
  // 源代码
  // a.js
  import bigFile from '30KB'
  console.log(bigFile);

  // b.js
  import bigFile from '30KB'
  console.log(bigFile);

  // c.js
  import bigFile from '30KB'
  console.log(bigFile);

  // main.js
  import(/* webpackChunkName:
  "async-a" */'./a')
  import(/* webpackChunkName:
  "async-b" */'./b')
  import(/* webpackChunkName:
  "async-c" */'./c')
  ```

  拆分前的构建产物如下

  - main.js

  - async-a.chunk.js 包含的模块 「30KB 」

  - async-b.chunk.js 包含的模块 「30KB」

  - async-c.chunk.js 包含的模块 「30KB 」

  此时 我们可以认为 模块 「30KB 」被 [ async-a.chunk.js, async-b.chunk.js,
  async-c.chunk.js ] 依赖。

- chunkSetsByCount 维护 chunks 集合个数 到 chunks 集合 的映射。主要作用 是为了后
  续找到「所有可拆分的 chunks 组合」

```
// Create a list of possible combinations
const combinationsCache = new Map(); // Map<string, Set<Chunk>[]>

const getCombinations = key => {
	const chunksSet = chunkSetsInGraph.get(key);
	var array = [chunksSet];
	if (chunksSet.size > 1) {
		for (const [count, setArray] of chunkSetsByCount) {
			// "equal" is not needed because they would have been merge in the first step
			if (count < chunksSet.size) {
				for (const set of setArray) {
					if (isSubset(chunksSet, set)) {
						array.push(set);
					}
				}
			}
		}
	}
	return array;
};
// ...
// Prepare some values
for (const module of compilation.modules) {
	// ...
	const chunksKey = getKey(module.chunksIterable);
	let combs = combinationsCache.get(chunksKey);
	if (combs === undefined) {
		combs = getCombinations(chunksKey);
		combinationsCache.set(chunksKey, combs);
	}
	// ...
}
```

getCombinations 方法通过 chunkSetsByCount 找到 所有「可拆分 chunks 组合」并缓存
到 combinationsCache 中。

比如 module-a 被 chunk-a, chunk-b, chunk-c 依赖, module-b 被 chunk-b, chunk-c 依
赖。那么对于 module-a, 拆分组合为
`{ chunk-a, chunk-b, chunk-c } , { chunk-b, chunk-c }`

思考:

**为什么要找到所有可拆分 chunks 的组合？**

设想场景:

1.  module-a 从 chunk-a, chunk-b, chunk-c 拆出。
2.  chunk-c 所在 chunkGroups 的 chunks 集合为 3。
3.  设置规则 maxRequest = 3。

该组合将违反了 maxRequest 规则, 该组合将被舍弃。但可满足「 组合二 module-a 从
chunk-a, chunk-b 拆出」。

```
const chunksInfoMap = new Map();

const addModuleToChunksInfoMap = (
	cacheGroup,
	cacheGroupIndex,
	selectedChunks,
	selectedChunksKey,
	module
) => {
	// Break if minimum number of chunks is not reached
	if (selectedChunks.length < cacheGroup.minChunks) return;
	// Determine name for split chunk
	const name = cacheGroup.getName(
		module,
		selectedChunks,
		cacheGroup.key
	);
	// Create key for maps
	// When it has a name we use the name as key
	// Elsewise we create the key from chunks and cache group key
	// This automatically merges equal names
	const key =
		cacheGroup.key +
		(name ? ` name:${name}` : ` chunks:${selectedChunksKey}`);
	// Add module to maps
	let info = chunksInfoMap.get(key);
	if (info === undefined) {
		chunksInfoMap.set(
			key,
			(info = {
				modules: new SortableSet(undefined, sortByIdentifier),
				cacheGroup,
				cacheGroupIndex,
				name,
				size: 0,
				chunks: new Set(),
				reuseableChunks: new Set(),
				chunksKeys: new Set()
			})
		);
	}
	info.modules.add(module);
	info.size += module.size();
	if (!info.chunksKeys.has(selectedChunksKey)) {
		info.chunksKeys.add(selectedChunksKey);
		for (const chunk of selectedChunks) {
			info.chunks.add(chunk);
		}
	}
};
```

```
for (const module of compilation.modules) {
	// ...
	// For all combination of chunk selection
	for (const chunkCombination of combs) {
		// Break if minimum number of chunks is not reached
		if (chunkCombination.size < cacheGroup.minChunks) continue;
		// Select chunks by configuration
		const {
			chunks: selectedChunks,
			key: selectedChunksKey
		} = getSelectedChunks(
			chunkCombination,
			cacheGroup.chunksFilter
		);

		addModuleToChunksInfoMap(
			cacheGroup,
			cacheGroupIndex,
			selectedChunks,
			selectedChunksKey,
			module
		);
	}
}
```

通过 getSelectedChunks 方法筛选有哪些 chunks 可被拆分, 这里使用到了
splitChunks.chunks 值做过滤。若 chunks 配置为 “all”, 则所有 chunks 都可被选择。
若 chunks 配置为 “async”, 则只能拆分 async 类型的 chunk。

通过 addModuleToChunksInfoMap 方法去初始化 chunksInfoMap,
addModuleToChunksInfoMap 算是整个源码中较为重要的函数, 上文提到
combinationsCache 存放的是所有「可拆分的 chunks 组合」, 这里的 chunksInfoMap 存
放的就是所有「拆分组合」, 它将 modules, chunks, cacheGroup 都链接在一起。

可能还是有些晦涩难懂, 这里以上文提到的例子展开讲解下。

```
// 源代码
// a.js
import bigFile from '30KB'
console.log(bigFile);

// b.js
import bigFile from '30KB'
console.log(bigFile);

// c.js
import bigFile from '30KB'
console.log(bigFile);

// main.js
import(/* webpackChunkName:
"async-a" */'./a')
import(/* webpackChunkName:
"async-b" */'./b')
import(/* webpackChunkName:
"async-c" */'./c')

// webpack.config.js 采用默认的 splitChunks 配置
module.exports = {
  //...
  optimization: {
    splitChunks: {
      chunks: 'async',
      minSize: 30000,
      maxSize: 0,
      minChunks: 1,
      maxAsyncRequests: 5,
      maxInitialRequests: 3,
      automaticNameDelimiter: '~',
      automaticNameMaxLength: 30,
      name: true,
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          priority: -10
        },
        default: {
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true
        }
      }
    }
  }
};
```

以上存在两个 cacheGroups, 显然「30KB」模块皆命中, 所有拆分组合都被列举出来了, 最
终形成的 chunksInfoMap 结果如下:

```
{
	'default name:async-a~async-b~async-c': {
		chunks:[async-a,async-b,async-c],
		cacheGroup: default,
		modules:[30KB],
		size:30833
		// ...
	}
	'vendors name:vendors~async-a~async-b~async-c':{
		chunks:[async-a,async-b,async-c],
		cacheGroup: vendor,
		modules:[30KB],
		size:30833
		// ...
	},
	'vendors name:vendors~async-a':{
		chunks:[async-a],
		cacheGroup: vendor,
		modules:[30KB],
		size:30833
		// ...
	},
	'vendors name:vendors~async-b':{
		chunks:[async-b],
		cacheGroup: vendor,
		modules:[30KB],
		size:30833
		// ...
	},
	'vendors name:vendors~async-c':{
		chunks:[async-c],
		cacheGroup: vendor,
		modules:[30KB],
		size:30833
		// ...
	}
}
```

最重要的 chunksInfoMap 数据结构介绍完毕, 后续便是 遍历 chunksInfoMap 每次选择最
优的一项 进行拆分。那么如何判断「最优」？

```
const compareEntries = (a, b) => {
  // 1. by priority
  const diffPriority = a.cacheGroup.priority - b.cacheGroup.priority;
  if (diffPriority) return diffPriority;
  // 2. by number of chunks
  const diffCount = a.chunks.size - b.chunks.size;
  if (diffCount) return diffCount;
  // 3. by size reduction
  const aSizeReduce = a.size * (a.chunks.size - 1);
  const bSizeReduce = b.size * (b.chunks.size - 1);
  const diffSizeReduce = aSizeReduce - bSizeReduce;
  if (diffSizeReduce) return diffSizeReduce;
  // 4. by cache group index
  const indexDiff = a.cacheGroupIndex - b.cacheGroupIndex;
  if (indexDiff) return indexDiff;
  // 5. by number of modules (to be able to compare by identifier)
  const modulesA = a.modules;
  const modulesB = b.modules;
  const diff = modulesA.size - modulesB.size;
  if (diff) return diff;
  // 6. by module identifiers
  modulesA.sort();
  modulesB.sort();
  const aI = modulesA[Symbol.iterator]();
  const bI = modulesB[Symbol.iterator]();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const aItem = aI.next();
    const bItem = bI.next();
    if (aItem.done) return 0;
    const aModuleIdentifier = aItem.value.identifier();
    const bModuleIdentifier = bItem.value.identifier();
    if (aModuleIdentifier > bModuleIdentifier) return -1;
    if (aModuleIdentifier < bModuleIdentifier) return 1;
  }
};
```

依次比较

1.  priority
2.  chunks 数量
3.  总体积减少大小（比如 组合 A 和 组合 B 拆分出的 chunk 体积都为 30833, 组合 A
    从 2 个 chunk 拆出, 组合 B 从 3 个 chunk 拆出, 所以组合 B 「总体积减少 」大
    于 组合 A「总体积减少 」, 则最优解是 组合 B）
4.  cacheGroups 索引位置
5.  包含的 module 集合长度
6.  两个组合内 每一个 module id 字符串

每次遍历 都找到了最优的拆分组合, 后续就要进行 拆分判断 & 具体拆分动作了。这一部
分已在上节「简略设计」中讲述, 后续源码就不再展开讲解了。

### 总结

Webpack v4.44.2 版本的 SplitChunks 插件源码共 1k 行, 加上近 300 行的
deterministicGroupingForModules maxSize 拆分算法, 为 webapp 应用的性能优化提供了
较为优秀的解决方案。再次感叹 webpack 的强大。

### 相关文章

- https://medium.com/webpack/webpack-4-code-splitting-chunk-graph-and-the-splitchunks-optimization-be739a861366

- https://web.dev/articles/granular-chunking-nextjs
