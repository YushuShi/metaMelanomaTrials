# Rebuild from the repository root with Rscript website/tests/fixtures/treatment_network_reference.R.
# The R packages are benchmark dependencies only. The published example is
# Hasselblad (1998), https://doi.org/10.1177/0272989X9801800110 (metadat::dat.hasselblad1998).
# Remove entire studies with both selected treatments to leave a genuine indirect target.
suppressPackageStartupMessages(library(metafor))
data(dat.hasselblad1998, package="metadat")
by_trial <- split(dat.hasselblad1998, dat.hasselblad1998$study)
first <- "grp_counseling"
second <- "no_contact"
by_trial <- Filter(function(d) !all(c(first, second) %in% d$trt), by_trial)
blocks <- lapply(by_trial, function(d) {
  # A trial-level continuity correction for a zero cell only in this binary benchmark.
  event <- d$xi
  nonevent <- d$ni - event
  cc <- if (any(event == 0 | nonevent == 0)) 0.5 else 0
  logodds <- log((event + cc) / (nonevent + cc))
  variance <- 1/(event + cc) + 1/(nonevent + cc)
  take <- seq.int(2L, nrow(d))
  covariance <- matrix(variance[1], length(take), length(take))
  diag(covariance) <- diag(covariance) + variance[take]
  list(trialId=as.character(d$study[1]), contrasts=data.frame(
    treatment=d$trt[take], comparator=d$trt[1], logEffect=logodds[take] - logodds[1]),
    covariance=covariance)
})
dat <- do.call(rbind, lapply(blocks, function(b) transform(b$contrasts,
                 study=b$trialId, within=factor(seq_len(nrow(b$contrasts))))))
arms <- sort(unique(c(dat$treatment, dat$comparator)))
X <- sapply(arms[-1], function(a) as.integer(dat$treatment == a) - as.integer(dat$comparator == a))
V <- as.matrix(Matrix::bdiag(lapply(blocks, '[[', 'covariance')))
contrast <- as.integer(arms[-1] == first) - as.integer(arms[-1] == second)
reference <- function(fit) {
  mu <- drop(contrast %*% coef(fit))
  se <- sqrt(drop(contrast %*% vcov(fit) %*% contrast))
  list(logEstimate=mu, se=se, tau2=unname(fit$tau2[1]), ratio=exp(mu),
       lower=exp(mu-qnorm(.975)*se), upper=exp(mu+qnorm(.975)*se))
}
gls <- rma.mv(logEffect, V, mods=X, intercept=FALSE, data=dat)
random <- rma.mv(logEffect, V, mods=X, intercept=FALSE, data=dat, method="REML",
                 random=~within | study, struct="CS", rho=0.5)
# The global design-by-treatment test compares generalized residuals from the
# consistency model with a separate set of basic contrasts for every treatment design.
design_key <- vapply(blocks, function(b) paste(sort(unique(c(b$contrasts$treatment,
                         b$contrasts$comparator))), collapse=";"), character(1))
design_id <- rep(unname(design_key), vapply(blocks, function(b) nrow(b$contrasts), integer(1)))
Z <- do.call(cbind, lapply(unique(design_id), function(key) {
  design_arms <- strsplit(key, ";", fixed=TRUE)[[1]]
  sapply(design_arms[-1], function(a) (design_id == key) *
           (as.integer(dat$treatment == a) - as.integer(dat$comparator == a)))
}))
residual_q <- function(x, s) {
  fit <- rma.mv(logEffect, s, mods=x, intercept=FALSE, data=dat)
  r <- as.vector(residuals(fit))
  drop(crossprod(r, solve(s, r)))
}
shape <- as.matrix(Matrix::bdiag(lapply(blocks, function(b) {
  n <- nrow(b$contrasts)
  (matrix(1, n, n) + diag(n)) / 2
})))
diagnostics <- function(tau2) {
  M <- V + tau2 * shape
  list(withinQ=residual_q(Z, V), withinDF=nrow(Z)-ncol(Z),
       betweenQ=residual_q(X, M)-residual_q(Z, M), betweenDF=ncol(Z)-ncol(X))
}
ref <- list(source="Hasselblad 1998 smoking cessation, trials directly comparing the target arms omitted",
            metafor=as.character(packageVersion("metafor")),first=first,second=second,
            common=c(reference(gls),diagnostics(0)),random=c(reference(random),diagnostics(random$tau2)),blocks=unname(blocks))
jsonlite::write_json(ref, "website/tests/fixtures/treatment_network_reference.json",
                     auto_unbox=TRUE, digits=16, dataframe="rows", pretty=TRUE)
