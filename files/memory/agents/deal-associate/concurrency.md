# Concurrent associate runs — re-check `proposals` at the moment of insert

Two arrivals on one deal seconds apart — an email and a WhatsApp forward of the same news, say —
wake two associate runs in parallel. Each run reads `proposals`, each sees nothing pending for
the same ask, and both insert.

Rule: the `proposals` check and the insert are one step — re-read the deal's pending rows
immediately before writing, and if a sibling run has already raised a row covering the same ask
(same deal + kind), raise nothing. If you find you inserted a duplicate, withdraw yours in the
same run.
