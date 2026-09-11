# Azure AI Foundry model pick for Buddy Scout / sales-agent (Sep 2026)

**Decision:** deploy **`DeepSeek-V4-Flash`** for cheap high-volume classification/extraction and **`gpt-5.6-sol`** for low-volume strategy/outreach. Keep **`gpt-5.6-luna`** as the safe cheap fallback and **`grok-4.6` Preview** as an A/B challenger for the smart tier, not the default.

_Assumptions: Standard Global/serverless pricing, USD per 1M tokens, short-context where applicable. Azure pricing pages render `$-` in text but expose the numeric values in page `price-data`; Microsoft docs/pricing URLs are cited below._

## Recommended deployments

| Workload | Pick | Foundry model/deployment name | Price / 1M tokens | Context | Why |
|---|---:|---|---:|---:|---|
| A. Cheap grunt work | **Winner** | `DeepSeek-V4-Flash` / pricing row “DeepSeek-V4 Flash Global” | **$0.19 in / $0.51 out**; cached in $0.028 | 1,000,000 in / 384,000 out | Cheapest credible long-context extractor/classifier in Foundry; AA says V4 Flash 0731 nearly matches GPT-5.6 Luna-level intelligence while much cheaper per task. |
| A. Cheap grunt work | Runner-up | `gpt-5.6-luna` | **$0.20 in / $1.20 out**; cached in $0.02; cache write $0.25 | 1,050,000 total; 922k in / 128k out | Slightly pricier output, but safest production reliability + structured/tooling behavior in Azure OpenAI. |
| B. Smart strategy/draft | **Winner** | `gpt-5.6-sol` | **$4 in / $20 out promo** Sep-Nov 2026; nominal $5/$30; cache write $6.25 nominal | 1,050,000 total; 922k in / 128k out | Best quality/presentation among Foundry-available models I found; 200 runs/month fits the $50 budget comfortably. |
| B. Smart strategy/draft | Runner-up | `grok-4.6` **Preview** | **Azure price not published on Grok Foundry page yet**; xAI direct pricing reported as ~$2 in / $6 out under 200k | 200,000; 128,000 max out | Potential cheap+strong challenger; Foundry docs list it, but real tester sentiment is mixed and it is Preview, so A/B before relying on it. |

## Viable candidate shortlist

| Provider | Exact Foundry model name | Foundry availability | Price / 1M input-output | Context / output | 1-line quality verdict |
|---|---|---:|---:|---:|---|
| OpenAI | `gpt-5.6-sol` | GA; some quota tiers gated | $5/$30 nominal; **$4/$20 promo** | 1.05M / 128k | Top production choice for polished sales strategy; AA: Sol max scored 59, near Claude Fable 5 at ~⅓ cost and strongest presentation/coding-agent results. |
| OpenAI | `gpt-5.6-terra` | GA | $2/$12 | 1.05M / 128k | Good balanced model, but AA explicitly says Terra is often dominated by Luna/Sol on the cost-quality Pareto frontier. |
| OpenAI | `gpt-5.6-luna` | GA | **$0.20/$1.20** | 1.05M / 128k | Best OpenAI budget model; AA says Luna max scored 51 and sits on the Pareto frontier for cost/intelligence. |
| OpenAI | `gpt-5.5` | GA | $5/$30 | 1.05M / 128k | Strong but now mostly obsolete versus GPT-5.6 Sol/Terra/Luna pricing and quality. |
| OpenAI | `gpt-5.4-mini` | GA | $0.75/$4.50 | 400k / 128k | Solid but too expensive for grunt work and outclassed by 5.6 for smart work. |
| OpenAI | `gpt-5.4-nano` | GA | $0.20/$1.25 | 400k / 128k | Cheap, but Luna is newer and roughly same input/lower output price. |
| OpenAI | `gpt-5-nano` | GA | **$0.05/$0.40** | 400k / 128k | Ultra-cheap; viable only after evals prove it does not miss subtle “actually hiring?” evidence. |
| OpenAI | `gpt-4.1-nano` | GA | $0.10/$0.40 | up to 1,047,576; 300k standard / 32,768 out | Great cheap long-context extraction fallback, but older/weaker than Luna/DeepSeek. |
| OpenAI | `gpt-4.1-mini` | GA | $0.40/$1.60 | up to 1,047,576; 300k standard / 32,768 out | Reliable structured-output baseline; not price/perf winner anymore. |
| OpenAI | `o4-mini` | GA | $1.10/$4.40 | 200k in / 100k out | Excellent compact reasoning, but overkill/costly for classification and less polished than Sol for outreach. |
| OpenAI | `o3` | GA | $2/$8 | 200k in / 100k out | Strong reasoning; cheaper output than Sol, but not the best model for polished sales copy. |
| DeepSeek | `DeepSeek-V4-Flash` | GA | **$0.19/$0.51**; cached $0.028 | 1M in / 384k out | Best cheap Foundry candidate; AA/Decoder: V4 Flash 0731 scores 50, ~1 point behind Luna, with strong price-performance. |
| DeepSeek | `DeepSeek-V4-Pro` | GA | $1.74/$3.48; cached $0.145 | 1M in / 384k out | More capable than Flash but worse value for this workload; consider only if Flash fails evals. |
| Meta | `Llama-4-Maverick-17B-128E-Instruct-FP8` | GA | $0.25/$1.00 | 1M / 1M | Attractive price/context, but no Foundry tool calling/JSON response format in docs and Reddit sentiment around Llama 4 Maverick was mixed/disappointed. |
| Meta | `Llama-3.3-70B-Instruct` | GA | $0.71/$0.71 | 128k / 8,192 | Solid open model baseline; not compelling versus Luna/DeepSeek unless you specifically want Meta. |
| Microsoft | `Phi-4-mini` | GA | **$0.075/$0.30** | 128k | Cheapest credible SLM; AA score around 6, so use only for very simple labels after evals. |
| Microsoft | `Phi-4` | GA | $0.125/$0.50 | 128k | Nice small-model value, but weaker long-form reasoning/copy than Luna/DeepSeek/Sol. |
| Microsoft | `MAI-Thinking-1` **Preview** | Preview | $2/$8; cached $0.20 | 256k / 64k | Interesting Microsoft-native reasoning model, but too little independent tester evidence for production default. |
| xAI / SpaceXAI | `grok-4.6` **Preview** | Listed in Foundry docs; pricing page omits it | **Unpublished on Azure**; xAI direct widely reported ~$2/$6 | 200k / 128k | Cheap-for-frontier on paper; Reddit testers split between “good and cheap” and “slow/token-hungry/not better than 4.5.” |
| xAI / SpaceXAI | `grok-4.1-fast-reasoning` / `grok-4.1-fast-non-reasoning` | GA | $0.20/$0.50 on “Grok 4.1 Fast Global” pricing row | 128k / 128k | Very cheap Grok option; promising for cheap extraction, but less third-party quality evidence than Luna/DeepSeek. |
| xAI / SpaceXAI | `grok-4.3` **Preview** | Preview | $1.25/$2.50 | 200k / 8,192 | Decent mid-price Grok, but 4.6/4.1-fast make it awkward. |
| xAI / SpaceXAI | `grok-4` | GA; registration required | $3/$15 | 262k / 8,192 | Good model historically, but no longer price/perf winner. |
| xAI / SpaceXAI | `grok-code-fast-1` | GA; registration required | $0.20/$1.50 | 256k / 8,192 | Coding-specialized; skip for sales classification/copy. |
| Mistral | `mistral-medium-3-5` **Preview** | Preview | $1.50/$7.50 | Foundry docs: 128k / 128k | Capable production model, but AA score/search snippets put it mid-tier and not cost-competitive here. |
| Mistral | `Mistral-Large-3` **Preview** | Listed | **No Azure token price found on pricing page** | text+image; output text | Not viable until pricing is published; likely not cheaper than Sol/Luna. |
| Cohere | `Cohere-command-a-plus-05-2026` **Preview** | Preview | $0.80/$3.20 | 128k / 64k | Good enterprise/RAG model; AA/Cohere cite Intelligence Index 37, but not best for either workload. |
| Cohere | `Cohere-command-a` | GA | $2.50/$10 | 131,072 / 8,182 | Too expensive for its current capability tier. |
| Cohere | `Cohere-rerank-v4.0-fast` / `Cohere-rerank-v4.0-pro` | GA | $2.00 / $2.50 per 1k searches | n/a | Useful for ranking retrieved docs/leads, not a substitute for classify/extract/generate. |

## Grok-specific read

- **Actually on Foundry?** Yes: Microsoft Learn lists `grok-4.6` Preview, `grok-4.3` Preview, `grok-4-20-reasoning`, `grok-4-20-non-reasoning`, `grok-4.1-fast-reasoning`, `grok-4.1-fast-non-reasoning`, `grok-4`, and `grok-code-fast-1` under SpaceXAI/Grok models sold by Azure. `grok-code-fast-1` and `grok-4` require registration; 4.6 is Preview.  
- **Pricing gap:** Azure’s Grok pricing page exposes prices through `Grok-4.3 Global` but does **not** show `grok-4.6` yet. Public xAI/direct-pricing sources consistently report `grok-4.6` at about **$2 input / $6 output / $0.50 cached input** below 200k tokens, but I would not treat that as guaranteed Azure billing until it appears in the Foundry pricing page or calculator.  
- **Tester sentiment:** Reddit/search snippets are genuinely mixed: one r/cursor tester says “good and cheap…but pretty slow / token hungry”; another r/singularity thread says wait for real reviews; another claims LMArena blind testing has it below 4.5. Translation: worth A/B testing for Workload B, not worth making your production default blindly.

## Budget sanity check

Even with generous prompts, the recommended pair fits the ~$50/month budget:

- **A: 5,000 grunt runs/month**, assume 2k input + 100 output each on `DeepSeek-V4-Flash`: about 10M input + 0.5M output → **~$2.16/month**.
- **B: 200 smart runs/month**, assume 8k input + 1.5k output each on `gpt-5.6-sol` promo: 1.6M input + 0.3M output → **~$12.40/month**. At nominal $5/$30 it is still only **~$17/month**.
- This leaves room for retries, evals, prompt-cache writes, logging, and occasional fallback calls under $50.

## Final recommendation

Use **`DeepSeek-V4-Flash`** for high-volume hiring classification/extraction because it is almost Luna-level on independent evaluations, has a huge context window for messy scraped pages, and is cheaper on output. Use **`gpt-5.6-sol`** for the 200/month sales-strategy drafts because the marginal cost is tiny at that volume and quality/polish matters more than saving a few dollars. If DeepSeek’s style or compliance profile makes you nervous, switch the cheap tier to **`gpt-5.6-luna`**; if Tomi wants to chase Grok’s value, A/B **`grok-4.6`** against Sol on 20 real company dossiers before trusting it.

## Sources

- Microsoft Learn — Foundry Models sold by Azure, model IDs/capabilities/context: https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure
- Azure OpenAI pricing page, GPT/o-series/4.1 prices: https://azure.microsoft.com/en-us/pricing/details/azure-openai/
- Microsoft blog — GPT-5.6 in Foundry, Sol/Terra/Luna pricing and promo: https://azure.microsoft.com/en-us/blog/gpt-5-6-now-available-in-microsoft-foundry/
- Foundry Models pricing overview: https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/aoai/
- Foundry Grok pricing page: https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/grok/
- Foundry DeepSeek pricing page: https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/deepseek/
- Foundry Llama pricing page: https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/llama/
- Foundry Mistral pricing page: https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/mistral-ai/
- Foundry Cohere pricing page: https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/cohere/
- Foundry Microsoft/Phi/MAI pricing page: https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/microsoft/
- Artificial Analysis — GPT-5.6 benchmark article: https://artificialanalysis.ai/articles/gpt-5-6-has-landed
- Artificial Analysis — DeepSeek V4 Flash 0731 benchmark article: https://artificialanalysis.ai/articles/deepseek-v4-flash-0731-scores-50-on-the-artificial-analysis-intelligence-index-10-points-above-previous-deepseek-v4-flash
- The Decoder — DeepSeek V4 Flash vs GPT-5.6 Luna summary: https://the-decoder.com/new-deepseek-flash-model-matches-openais-gpt-5-6-luna-at-roughly-60-percent-lower-cost/
- Reddit r/cursor — Grok 4.6 tester sentiment: https://www.reddit.com/r/cursor/comments/1vmibtf/grok_46_amazing/
- Reddit r/singularity — Grok 4.6 mixed benchmark sentiment: https://www.reddit.com/r/singularity/comments/1vmhtfu/grok_46_is_an_equivalent_to_sol_56_according_to/
- Reddit r/LocalLLaMA — Llama 4 disappointment/mixed sentiment: https://www.reddit.com/r/LocalLLaMA/comments/1jsl37d/im_incredibly_disappointed_with_llama4/
- Reddit r/LocalLLaMA — Llama 4 independent benchmark discussion: https://www.reddit.com/r/LocalLLaMA/comments/1jw0c2i/llama_4_maverick_scores_on_seven_independent/
- Mistral Medium 3.5 AA/search evidence: https://artificialanalysis.ai/models/mistral-medium-3-5
- Cohere Command A+ launch / AA score: https://cohere.com/blog/command-a-plus
