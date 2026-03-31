# ML Knowledge Graph Explorer

Interactive 3D knowledge graph visualizer for 2,081 machine learning and mathematics concepts with 5,149 prerequisite edges. Explore the graph in three dimensions — rotate, zoom, pan — with multiple layout algorithms and upstream dependency highlighting.

The graph was built by the `build-knowledge-graph` skill, invoked by the prompt

```
Build a knowledge graph with your build-knowledge-graph skill. It's imperative that you don't stop early, work until the terminating conditions (max 100 depth or the prescribed mathematical operations) are reached. Don't remove any nodes, just keep on processing. Work as long as you have to.
The starting nodes are:

"Partial Least Squares Regression", "Principal Components Regression", "Least Angle Regression", "Orthogonal Matching Pursuit", "Huber Regression", "RANSAC", "Theil-Sen Regression", "Quantile Regression", "Poisson Regression", "Negative Binomial Regression", "Probit Regression", "Ordinal Regression", "Cox Proportional Hazards Model", "AFT Survival Model", "Complement Naive Bayes", "AODE", "TabNet", "TabTransformer", "NODE", "Deep & Cross Network", "Deep Crossing", "Product-based Neural Network", "AutoInt", "xDeepFM", "Field-aware Factorization Machine", "Session kNN", "Bayesian Personalized Ranking", "SLIM", "Personalized PageRank", "Markov Clustering", "DENCLUE", "CURE", "ROCK", "Chameleon", "BIRCH", "Bisecting k-Means", "Mini-Batch k-Means", "Deterministic Annealing", "Growing Neural Gas", "Neural Gas", "ART", "ARTMAP", "Possibilistic c-Means", "Gustafson-Kessel", "Mixture of Factor Analyzers", "Dirichlet Process Mixture Model", "Latent Dirichlet Allocation", "Correlated Topic Model", "Probabilistic Latent Semantic Analysis", "Hierarchical Dirichlet Process", "Probabilistic PCA", "Canonical Correlation Analysis", "Partial Least Squares", "Linear Mixed Model", "Generalized Additive Model", "Generalized Estimating Equations", "Spline Regression", "Multivariate Adaptive Regression Splines", "Group Lasso", "Fused Lasso", "Graphical Lasso", "Sparse Group Lasso", "Least Squares SVM", "Twin SVM", "Relevance Vector Machine", "Tsetlin Machine", "Broad Learning System", "Extreme Deconvolution", "Copula Model", "Normalizing Flow", "Masked Autoregressive Flow", "Inverse Autoregressive Flow", "Transformer-XL", "Reformer", "Longformer", "Performer", "Linformer", "BigBird", "FNet", "Nyströmformer", "Informer", "Autoformer", "FEDformer", "TimesNet", "iTransformer", "TiDE", "DLinear", "N-HiTS", "ES-RNN", "WaveRNN", "Deep State Space Model", "Neural ODE", "Liquid Neural Network", "Neural CDE", "Pointer Network", "Memory Network", "Neural Turing Machine", "Differentiable Neural Computer", "Hopfield Network", "Modern Hopfield Network", "Perceiver", "Decision Transformer", "Trajectory Transformer", "TabPFN", "ProtoPNet", "Neural Processes", "Gaussian Process Regression", "Gaussian Process Classification", "Deep Gaussian Process", "Sparse Gaussian Process", "Bayesian Optimization", "Tree-structured Parzen Estimator", "Successive Halving", "Hyperband", "BOHB", "Optuna-style Sampler", "Nested Sampling", "Particle Filter", "Sequential Monte Carlo", "Expectation Propagation", "Loopy Belief Propagation", "Junction Tree Algorithm", "Mean-Field Variational Inference", "Collapsed Gibbs Sampling", "Metropolis-Hastings", "Hamiltonian Monte Carlo", "No-U-Turn Sampler", "Annealed Importance Sampling", "Contrastive Divergence", "Persistent Contrastive Divergence", "Wake-Sleep", "Noise-Contrastive Estimation", "Score Matching", "Denoising Score Matching", "Pseudo-Labeling", "Self-Training", "Co-Training", "Tri-Training", "FixMatch", "MixMatch", "Mean Teacher", "Noisy Student", "Label Spreading", "Graph Diffusion Network", "Relational Graph Convolutional Network", "ChebNet", "SEAL", "TransE", "RotatE", "ComplEx", "DistMult", "ConvE", "Variational Graph Autoencoder", "Neural Graph Collaborative Filtering", "DiffPool", "EdgeConv", "PointNet", "Point Transformer", "VoxelNet", "CenterNet", "YOLO", "SSD", "Faster R-CNN", "RetinaNet", "FCOS", "Cascade R-CNN", "HRNet", "SegNet", "PSPNet", "BiSeNet", "LaneNet", "RAFT", "FlowNet", "SuperPoint", "SuperGlue", "NeRF", "Instant-NGP", "Gaussian Splatting", "DreamBooth", "ControlNet", "InstructPix2Pix", "Imagen", "DALL·E", "VQ-GAN", "MaskGIT", "Muse", "Parti", "Consistency Model", "Progressive GAN", "StarGAN", "SRGAN", "ESRGAN", "TimeGAN", "TabDDPM", "Masked Language Model", "Causal Language Model", "Prefix Language Model", "SpanBERT", "ERNIE", "UL2", "Switch Transformer", "GShard", "Sparse Mixture of Experts", "Hierarchical Mixture of Experts", "Soft Decision Tree", "Neural Decision Forest", "Deep Forest", "Mondrian Forest", "Oblique Random Forest", "Online Bagging", "Online Boosting", "Hoeffding Tree", "Adaptive Random Forest", "Leveraging Bagging", "FTRL-Proximal", "Mirror Descent", "Natural Gradient Descent", "K-FAC", "Shampoo", "Lion", "Yogi", "AdaBelief", "AdaFactor", "Lookahead", "LARS", "LAMB", "SAM", "ASAM", "Path-SGD", "Truncated Newton Method", "Simulated Annealing", "Tabu Search", "Estimation of Distribution Algorithm", "Cross-Entropy Method", "Memetic Algorithm", "NSGA-II", "MAP-Elites", "Quality-Diversity Optimization", "Banditron", "NeuralUCB", "Neural Thompson Sampling", "Contextual Thompson Sampling", "EXP3", "EXP4", "Hedge", "Gaussian Process Bandit", "SafeOpt", "Counterfactual Regret Minimization", "Monte Carlo Tree Search", "UCT", "POMCP", "Distributional DQN", "C51", "QR-DQN", "IQN", "DrQ", "Dreamer", "PlaNet", "World Model", "IMPALA", "R2D2", "NGU", "Agent57", "Hindsight Experience Replay", "QMIX", "VDN", "MADDPG", "COMA", "MAPPO", "Behavior Cloning", "DAgger", "Inverse Reinforcement Learning", "Maximum Entropy IRL", "GAIL", "AIRL", "Offline Reinforcement Learning", "Hierarchical Reinforcement Learning", "Options Framework", "Feudal Network", "Successor Representation", "Predictive State Representation", "Deep Equilibrium Model", "Liquid Time-Constant Network", "Set Transformer", "Deep Sets", "Neural Statistician", "Slot Attention", "Routing Transformer", "CapsNet", "PCANet", "ShuffleNet", "SqueezeNet", "GhostNet", "RegNet", "NFNet", "MaxViT", "CoAtNet", "BEiT", "DINOv2", "I-JEPA", "JEPA", "Masked Autoencoder ViT", "Segment Anything Model", "Grounding DINO", "Grounded SAM", "BLIP-2", "Kosmos-2", "PaLI", "VideoMAE", "TimeSformer", "Video Swin Transformer", "SlowFast", "I3D", "C3D", "ConvLSTM", "PredRNN", "PhyDNet", "Molecular Graph Neural Network", "SchNet", "DimeNet", "NequIP", "AlphaFold", "RoseTTAFold", "SE(3)-Transformer", "Equivariant GNN", "DiffDock", "Neural Collaborative Ranking", "Caser", "SASRec", "BERT4Rec", "GRU4Rec", "DIN", "DIEN", "MIND", "AutoRec", "Variational Autoencoder Recommender", "EASE", "CDAE", "DSSM", "Poly-Encoder", "Cross-Encoder", "ColBERT", "RankNet", "LambdaRank", "LambdaMART", "ListNet", "ListMLE", "Coordinate Ascent Ranking", "BM25 Learning to Rank", "Survival Random Forest", "DeepSurv", "DeepHit", "CoxBoost", "Competing Risks Model", "Ordinary Least Squares", "Ridge Regression", "Lasso", "Elastic Net", "Logistic Regression", "Multinomial Logistic Regression", "Linear Discriminant Analysis", "Quadratic Discriminant Analysis", "Perceptron", "Passive-Aggressive", "Bayesian Linear Regression", "k-Nearest Neighbors", "Radius Neighbors", "Nearest Centroid", "Learning Vector Quantization", "Support Vector Machine", "Support Vector Regression", "One-Class SVM", "Kernel SVM", "Kernel Ridge Regression", "CART", "ID3", "C4.5", "C5.0", "CHAID", "M5", "Decision Stump", "RIPPER", "CN2", "RuleFit", "Gaussian Naive Bayes", "Multinomial Naive Bayes", "Bernoulli Naive Bayes", "Bayesian Network", "Hidden Naive Bayes", "Bagging", "Random Forest", "Extra Trees", "Rotation Forest", "AdaBoost", "Gradient Boosting", "XGBoost", "LightGBM", "CatBoost", "LogitBoost", "Stacked Generalization", "Mixture of Experts", "k-Means", "k-Medoids", "PAM", "CLARA", "CLARANS", "Agglomerative Clustering", "Divisive Clustering", "Ward Linkage", "DBSCAN", "HDBSCAN", "OPTICS", "Mean Shift", "Gaussian Mixture Model", "Expectation-Maximization", "Spectral Clustering", "Affinity Propagation", "Fuzzy c-Means", "Self-Organizing Map", "Principal Component Analysis", "Kernel PCA", "Sparse PCA", "Incremental PCA", "Factor Analysis", "Independent Component Analysis", "Nonnegative Matrix Factorization", "Singular Value Decomposition", "Truncated SVD", "Latent Semantic Analysis", "Multidimensional Scaling", "Isomap", "Locally Linear Embedding", "Hessian LLE", "Laplacian Eigenmaps", "t-SNE", "UMAP", "Diffusion Maps", "Autoencoder", "Variational Autoencoder", "β-VAE", "Vector-Quantized VAE", "Kernel Density Estimation", "RealNVP", "Glow", "Neural Spline Flow", "Apriori", "FP-Growth", "Eclat", "Isolation Forest", "Local Outlier Factor", "Elliptic Envelope", "Deep SVDD", "Autoregressive Model", "Moving Average Model", "ARMA", "ARIMA", "SARIMA", "VAR", "VECM", "Exponential Smoothing", "Holt-Winters", "State Space Model", "Kalman Filter", "Hidden Markov Model", "Prophet", "RNN", "LSTM", "GRU", "Temporal Convolutional Network", "Sequence-to-Sequence", "Transformer", "S4", "Mamba", "RWKV", "RetNet", "Hyena", "N-BEATS", "DeepAR", "Temporal Fusion Transformer", "PatchTST", "Multilayer Perceptron", "Radial Basis Function Network", "Extreme Learning Machine", "Kolmogorov-Arnold Network", "LeNet", "AlexNet", "ZFNet", "VGG", "GoogLeNet", "Inception", "ResNet", "ResNeXt", "DenseNet", "MobileNet", "EfficientNet", "ConvNeXt", "U-Net", "Fully Convolutional Network", "DeepLab", "Mask R-CNN", "Elman Network", "Jordan Network", "Bidirectional RNN", "Bahdanau Attention", "Luong Attention", "BERT", "RoBERTa", "ALBERT", "DistilBERT", "DeBERTa", "ELECTRA", "XLNet", "T5", "mT5", "BART", "PEGASUS", "GPT", "LLaMA", "Mistral", "Mixtral", "PaLM", "Gemini", "Vision Transformer", "Swin Transformer", "DETR", "DINO", "MAE", "CLIP", "SigLIP", "Flamingo", "BLIP", "GAN", "DCGAN", "Conditional GAN", "CycleGAN", "Pix2Pix", "StyleGAN", "Wasserstein GAN", "PixelRNN", "PixelCNN", "WaveNet", "DDPM", "DDIM", "Score SDE", "Latent Diffusion Model", "Stable Diffusion", "Diffusion Transformer", "Rectified Flow", "Flow Matching", "Dynamic Programming", "Value Iteration", "Policy Iteration", "Monte Carlo Control", "Temporal Difference Learning", "Q-Learning", "SARSA", "Expected SARSA", "DQN", "Double DQN", "Dueling DQN", "Rainbow", "REINFORCE", "Actor-Critic", "A2C", "A3C", "DDPG", "TD3", "Soft Actor-Critic", "TRPO", "PPO", "AlphaGo", "AlphaZero", "MuZero", "CQL", "IQL", "BCQ", "ε-Greedy", "UCB", "Thompson Sampling", "LinUCB", "Label Propagation", "DeepWalk", "Node2Vec", "Graph Convolutional Network", "GraphSAGE", "Graph Attention Network", "GIN", "Graph Autoencoder", "Message Passing Neural Network", "Graph Transformer", "Temporal Graph Network", "Siamese Network", "Triplet Network", "SimCLR", "MoCo", "BYOL", "Barlow Twins", "VICReg", "CPC", "Conditional Random Field", "Structured SVM", "Connectionist Temporal Classification", "Energy-Based Model", "Structural Causal Model", "Causal Forest", "Double Machine Learning", "Targeted Maximum Likelihood Estimation", "Probabilistic Graphical Model", "Variational Inference", "Markov Chain Monte Carlo", "Belief Propagation", "MAML", "Reptile", "Prototypical Network", "Matching Network", "Relation Network", "Adapter", "LoRA", "Prefix Tuning", "Prompt Tuning", "DPO", "GRPO", "Matrix Factorization", "Alternating Least Squares", "SVD++", "Factorization Machine", "Wide & Deep", "DeepFM", "Two-Tower Model", "Neural Collaborative Filtering", "Session-Based Recommender", "Conformer", "Whisper", "RNN-T", "Gradient Descent", "Stochastic Gradient Descent", "Momentum", "Nesterov Momentum", "AdaGrad", "RMSProp", "Adam", "AdamW", "L-BFGS", "Coordinate Descent", "Backpropagation", "Population-Based Training", "Genetic Algorithm", "Genetic Programming", "Neuroevolution", "CMA-ES", "Differential Evolution", "Particle Swarm Optimization", "Ant Colony Optimization", "Fuzzy Rule-Based System", "Neuro-Fuzzy System", "Echo State Network", "Reservoir Computing", "Spiking Neural Network", "Capsule Network", "Hebbian Learning", "Boltzmann Machine", "Restricted Boltzmann Machine", "Deep Belief Network", "Isotonic Regression", "LOESS", "Stepwise Regression", "Robust PCA", "Zero-Inflated Poisson Regression", "Tweedie Regression", "Beta Regression", "Dirichlet Regression", "Reduced Rank Regression", "Nadaraya-Watson Estimator", "Kernel Logistic Regression", "Multiple Kernel Learning", "Bayesian Additive Regression Trees", "NGBoost", "TARNet", "Quantile Regression Forest", "X-Means", "G-Means", "DP-Means", "Canopy Clustering", "Kernel k-Means", "Spectral Biclustering", "Subspace Clustering", "Correlation Clustering", "Random Projection", "Locality-Sensitive Hashing", "TriMap", "PaCMAP", "PHATE", "Sparse Autoencoder", "Contractive Autoencoder", "Denoising Autoencoder", "Slow Feature Analysis", "Neighborhood Components Analysis", "Structural Topic Model", "Dynamic Topic Model", "Word2Vec", "GloVe", "FastText", "ELMo", "Sentence-BERT", "Doc2Vec", "TF-IDF", "TBATS", "Croston's Method", "Theta Method", "GARCH", "Matrix Profile", "Granger Causality", "Ladder Network", "Highway Network", "WideResNet", "Xception", "NASNet", "DARTS", "MLP-Mixer", "gMLP", "ResMLP", "Mixture of Depths", "H3", "xLSTM", "Griffin", "MEGA", "Multi-Query Attention", "Grouped-Query Attention", "GraphGPS", "SGC", "ClusterGCN", "GraphSAINT", "TuckER", "QuatE", "EfficientDet", "Feature Pyramid Network", "CornerNet", "Panoptic FPN", "Depth Anything", "DPT", "Florence", "InternVL", "VQ-Diffusion", "Cascaded Diffusion", "Classifier-Free Guidance", "AudioLDM", "MusicGen", "SoundStream", "EnCodec", "VITS", "VALL-E", "LLaVA", "CogVLM", "Qwen-VL", "Gato", "RT-2", "Phi", "Qwen", "Jamba", "Retrieval-Augmented Generation", "Fusion-in-Decoder", "RETRO", "Memorizing Transformer", "TD(λ)", "V-trace", "MPO", "AWR", "RLHF", "Constitutional AI", "Reward Modeling", "LOLA", "Rprop", "RAdam", "Adan", "Sophia", "Muon", "Polyak Averaging", "ZeRO", "Mixup", "CutMix", "DAGMM", "AnoGAN", "PatchCore", "PADIM", "Kaplan-Meier Estimator", "Nelson-Aalen Estimator", "Aalen Additive Model", "Fine-Gray Model", "Propensity Score Matching", "Instrumental Variable Regression", "Regression Discontinuity", "Difference-in-Differences", "Synthetic Control Method", "Bayesian Structural Time Series", "Uplift Modeling", "Bayesian Neural Network", "MC Dropout", "Laplace Approximation", "Stein Variational Gradient Descent", "Indian Buffet Process", "Chinese Restaurant Process", "Approximate Bayesian Computation", "Federated Averaging", "Differentially Private SGD", "PATE", "Split Learning", "Fourier Neural Operator", "DeepONet", "Physics-Informed Neural Network", "Hamiltonian Neural Network", "Lagrangian Neural Network", "Neural SDE", "Continuous Normalizing Flow", "Test-Time Training", "Knowledge Distillation", "Lottery Ticket Hypothesis", "Quantization-Aware Training", "Speculative Decoding", "Dataset Distillation"
```

## Local Development

No build step required. Serve the static files with any HTTP server:

```bash
# Python
python3 -m http.server 8000

# Node.js (npx, no install needed)
npx serve .
```

Then open http://localhost:8000 in your browser.

## Layout Cache

The app can optionally read `knowledge_graph.layout.json` at startup as a local cache of precomputed node positions for the default force layout.

- If the file exists and is valid, those cached positions are applied immediately.
- If the file is missing or invalid, the app falls back to computing the initial force layout in the browser.
- Hierarchical, cluster, and radial layouts are not read from this file; they are computed on demand when you switch layouts.

`knowledge_graph.layout.json` is treated as a generated local artifact and is ignored by git.

## Usage

- **Rotate**: drag
- **Zoom**: scroll
- **Pan**: right-drag
- **Click** a node to focus its prerequisite/dependent context
- **Shift+Click** additional nodes to build a multi-node selection group
- **Double-click** a node for ego-centric radial layout
- **Search** to filter concepts by name
- **Layout selector** to switch between Force, Hierarchical, Cluster, and Radial views
- **Legend** — click a cluster to highlight all its nodes

## Video Rendering Automation

The explorer now exposes a deterministic timeline API on `window.graphVideo`:

```js
window.graphVideo = {
  async runScript(script) { ... },
  async seek(t) { ... },
  async captureFrame() { ... }, // PNG data URL (base64)
  getDuration() { ... },
};
```

Supported script actions:

- `selectNode` / `unselectNode`
- `focusNode` (selection + camera focus)
- `cameraFocus` (camera-only focus)
- `moveCamera`
- `highlightNeighbors` (prerequisites + dependents)
- `highlightDescendants` (descendants up to `level`)
- `highlightDependencies` (dependencies up to `level`)
- `highlightDepthGroupNodes` (all nodes at exact `level`)
- `highlightDepthEdges` (edges between `from` and `to` depth levels, inclusive)
- `highlightLowerSlice` (all nodes/edges with depth `<= to`)
- `highlightUpperSlice` (all nodes/edges with depth `>= from`)
- `hideGraph` / `fadeGraph` / `revealGraph`
- `openTooltip` / `closeTooltip` / `closeAllTooltips` / `fadeLabel`
- `orbit` / `autoRotate`
- `zoomTo`

Camera actions are interpolated over `duration` and are smooth by default.
If `duration` is omitted on a camera action, a default smooth duration is used.

Aliases are accepted for convenience:
`select`, `unselect`, `focus`, `focusCamera`, `move`, `cameraMove`, `rotateCamera`, `openNodeTooltip`, `closeNodeTooltip`.

Node references can use:

- internal node IDs
- node labels (case-insensitive)
- slug-style labels (for example `gradient-descent`)

### Render Script (Puppeteer + ffmpeg)

1. Install prerequisites:

```bash
npm install --save-dev puppeteer
# ffmpeg must also be installed and available in PATH
```

2. Run the renderer:

```bash
node scripts/render-graph-video.mjs \
  --script ./scripts/video-script.example.json \
  --output ./tmp/graph-video.mp4 \
  --fps 30 \
  --width 1920 \
  --height 1080 \
  --verbose
```

By default, the script:

- launches Puppeteer
- opens a local static server for this repo
- loads your timeline into `window.graphVideo`
- seeks frame-by-frame
- saves PNGs to a temporary frame directory
- stitches frames with `ffmpeg`

Use `--keep-frames` if you want to preserve individual PNGs.
Use `--verbose` to print detailed diagnostics (page errors, request failures, and per-frame seek/capture/write timing).
