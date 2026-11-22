# The publication-time NMA uses metafor::rma.mv directly. Each independent trial
# supplies its own sampling covariance. For arbitrary signed treatment contrasts
# B, the random covariance is tau² B B' / 2; two shared-control contrasts have
# covariance +tau²/2. No R installation is needed to serve the resulting site.
if (!all(vapply(c("metafor", "jsonlite", "Matrix"), requireNamespace, logical(1), quietly=TRUE))) quit(status=42)
suppressPackageStartupMessages(library(metafor))
args <- commandArgs(trailingOnly=TRUE)
components <- jsonlite::fromJSON(args[1], simplifyVector=FALSE)
fit_component <- function(component) {
  arms <- unlist(component$arms)
  blocks <- component$blocks
  incidence <- function(block) {
    rows <- block$contrasts
    t(vapply(rows, function(c) as.numeric(arms == c$treatment) -
               as.numeric(arms == c$comparator), numeric(length(arms))))
  }
  xs <- lapply(blocks, incidence)
  V <- as.matrix(Matrix::bdiag(lapply(blocks, function(b) {
    do.call(rbind, lapply(b$covariance, unlist))
  })))
  shape <- as.matrix(Matrix::bdiag(lapply(xs, function(b) tcrossprod(b)/2)))
  X <- do.call(rbind, xs)[,-1,drop=FALSE]
  y <- unlist(lapply(blocks, function(b) vapply(b$contrasts, '[[', numeric(1), 'logEffect')))
  obs <- sprintf("contrast%06d", seq_along(y))
  dimnames(shape) <- list(obs, obs)
  dat <- data.frame(y, obs)
  encode <- function(fit, tau2) {
    b <- as.numeric(coef(fit)); variance <- unname(as.matrix(vcov(fit)))
    if (!all(is.finite(c(b, variance, tau2))) || tau2 < 0 || length(b) != ncol(X))
      stop("Incomplete coefficient or variance output from metafor")
    list(available=TRUE, beta=I(b), covariance=variance, tau2=tau2)
  }
  common <- rma.mv(y, V, mods=X, intercept=FALSE, data=dat, method="FE")
  random <- if (nrow(X) > ncol(X)) {
    fit <- rma.mv(y, V, mods=X, intercept=FALSE, data=dat, method="REML",
                  random=~1|obs, R=list(obs=shape), Rscale="none")
    encode(fit, unname(fit$sigma2))
  } else list(available=FALSE, reason="Network heterogeneity cannot be estimated by REML with zero residual degrees of freedom.")
  list(arms=I(arms), models=list(common=encode(common, 0), random=random))
}
results <- lapply(components, fit_component)
jsonlite::write_json(list(engine=paste("R metafor", packageVersion("metafor")), components=results),
                     args[2], auto_unbox=TRUE, digits=16, pretty=FALSE)
