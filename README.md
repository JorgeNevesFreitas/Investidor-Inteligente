# app_context.nd — Investidor Inteligente

## Contexto da aplicação

A aplicação **Investidor Inteligente** é uma aplicação de análise fundamentalista e gestão de investimentos em ações, inspirada na abordagem de Warren Buffett / value investing.

A aplicação serve para:

* analisar empresas cotadas através de dados financeiros históricos;
* importar informação financeira de fontes externas;
* calcular rácios financeiros;
* estimar valor intrínseco;
* comparar preço de mercado com valor intrínseco;
* gerir carteira de investimentos;
* manter wishlist de empresas a analisar;
* guardar todas as empresas e dados analisados em base de dados.


---

## Objetivo principal

Criar uma ferramenta simples, robusta e persistente para análise de ações, focada em investidores de longo prazo.

O utilizador introduz o ticker da empresa e a aplicação deve conseguir:

1. identificar a empresa;
2. importar dados financeiros históricos;
3. guardar os dados em base de dados;
4. apresentar demonstrações financeiras e rácios;
5. calcular valor intrínseco;
6. indicar se a ação está atrativa ou não;
7. permitir acompanhar empresas analisadas, wishlist e carteira.

---

## Fontes de dados

### Empresas dos EUA

Para empresas norte-americanas, a fonte principal deve ser a SEC / EDGAR / data.sec.gov.

A aplicação deve:

* usar o ticker para identificar o CIK;
* procurar filings 10-K;
* obter dados financeiros estruturados em JSON/XBRL;
* importar preferencialmente os últimos 10 anos;
* caso não existam 10 anos, importar pelo menos os últimos 5 anos;
* atualizar de forma incremental quando houver novos 10-K.

### Empresas não norte-americanas

Para empresas não norte-americanas, a fonte principal deve ser:

```text
https://stockanalysis.com/
```

A aplicação deve permitir:

* importar dados pelo ticker;
* importar dados através de link manual do Stock Analysis;
* guardar o link associado à empresa;
* usar esse link em atualizações futuras.

---

## Persistência dos dados

Regra crítica:

Todos os dados importados devem ficar guardados numa base de dados persistente.

A aplicação NÃO deve voltar a carregar tudo do zero sempre que se entra na empresa.

Ao abrir uma empresa já analisada:

1. carregar primeiro os dados guardados na base de dados;
2. mostrar a última data de importação/atualização;
3. permitir atualização manual através do botão "Atualizar".

---

## Atualização de dados

### Botão "Atualizar"

O botão "Atualizar" deve funcionar em modo incremental.

Deve:

* procurar apenas dados novos ou alterados;
* adicionar novos anos;
* atualizar anos existentes apenas se houver alteração real;
* nunca duplicar anos;
* nunca apagar histórico existente;
* nunca fazer reload completo por defeito.

Reload completo só deve existir através de ação explícita, por exemplo:

```text
Reimportar tudo
```

### Importação por ano específico

A aplicação deve permitir forçar a importação de um ano específico.

Exemplo:

```text
Importar ano específico: 2024
```

Esta opção serve para resolver casos em que o último ano não foi automaticamente importado.

Regras:

* se o ano não existir, inserir;
* se o ano já existir, comparar e atualizar apenas se houver diferenças;
* nunca duplicar o mesmo fiscal year;
* marcar o método como `manual_year_import`.

---

## Demonstrações financeiras

Para cada empresa, a aplicação deve guardar e apresentar:

* Income Statement;
* Balance Sheet;
* Cash Flow Statement.

Os dados devem estar organizados por ano fiscal.

### Campos principais

#### Income Statement

* Revenue
* Revenue Growth
* Gross Profit
* Gross Margin
* Operating Income
* EBIT / EBITDA, quando disponível
* Net Income
* Net Income Growth
* EPS basic
* EPS diluted
* EPS Growth
* SG&A
* R&D
* Interest Expense

#### Balance Sheet

* Cash and Cash Equivalents
* Current Assets
* Total Assets
* Current Liabilities
* Total Liabilities
* Long-term Debt
* Short-term Debt
* Shareholders’ Equity
* Book Value per Share
* Shares Outstanding

#### Cash Flow Statement

* Operating Cash Flow
* Capital Expenditures
* Free Cash Flow
* Free Cash Flow Growth
* Dividends Paid
* Share Repurchases

---

## Rácios e métricas

A aplicação deve calcular e apresentar, entre outros:

* Revenue Growth
* Gross Margin
* EBIT Growth
* Net Income Growth
* EPS Growth
* Free Cash Flow Growth
* ROE
* Debt / Equity
* Current Ratio
* SG&A / Revenue
* R&D / Revenue
* Payout Ratio
* Market Cap
* Market Cap Growth
* Shares Outstanding Growth

Os rácios devem ser apresentados em tabelas e gráficos.

---

## Valuation

A aplicação deve calcular o valor intrínseco da empresa através de Discounted Cash Flow.

### Método padrão

* Free Cash Flow

### Método alternativo

* EPS

O utilizador deve poder escolher o método, mas o Free Cash Flow deve ser o padrão.

### Inputs do valuation

* taxa de desconto;
* taxa de crescimento anos 1 a 5;
* taxa de crescimento anos 6 a 10;
* taxa de crescimento terminal;
* margem de segurança.

### Outputs do valuation

* valor intrínseco total / market cap intrínseco;
* valor intrínseco por ação;
* valor com margem de segurança;
* preço atual da ação;
* upside;
* IRR esperado, quando aplicável;
* classificação automática.

---

## Preço atual da ação

O preço atual da ação deve ser obtido online, em tempo real ou o mais próximo possível do momento atual.

Regras:

* nunca mostrar `0.00` como preço válido se a fonte falhar;
* se o preço não estiver disponível, mostrar `Preço indisponível`;
* nunca calcular upside com preço igual a zero;
* nunca mostrar `Infinity%` ou `NaN`;
* guardar timestamp da última atualização do preço;
* usar o preço atual para recalcular upside e decisão.

---

## Classificação automática

A aplicação deve classificar a empresa com base no preço atual e valor intrínseco.

Regras:

* **Investir**: preço atual abaixo do valor intrínseco com margem de segurança;
* **Atento**: preço atual entre valor intrínseco com margem de segurança e valor intrínseco sem margem;
* **Aguardar**: preço atual acima do valor intrínseco sem margem de segurança;
* **Investido**: quando o utilizador tem ações dessa empresa em carteira;
* **Sem dados**: quando não existe preço ou valuation suficiente.

### Visual

O badge de decisão deve ter efeito visual tipo "sinal de vida":

* verde para Investir;
* amarelo para Atento;
* vermelho para Aguardar / Sobrevalorizado;
* azul ou cinza para Sem dados;
* animação subtil com glow ou pulso leve.

---

## Dashboard resumo

A aplicação deve ter uma página resumo com as empresas analisadas.

Deve mostrar:

* ticker;
* nome da empresa;
* preço atual;
* valor intrínseco por ação;
* margem de segurança;
* upside;
* decisão;
* principais rácios;
* data da última atualização;
* botão para abrir análise;
* opção de eliminar empresa com ícone de caixote do lixo.

A eliminação deve pedir confirmação antes de apagar.

---

## Relatório da empresa

Cada empresa deve ter uma página de relatório com:

* dados gerais da empresa;
* fonte de dados;
* última atualização;
* Income Statement;
* Balance Sheet;
* Cash Flow Statement;
* rácios;
* gráficos;
* valuation;
* classificação automática;
* botões:

  * Atualizar;
  * Importar ano específico;
  * Carregar dados via link Stock Analysis;
  * Reimportar tudo, se existir, apenas como ação explícita.

---

## Portfolio

A aplicação deve permitir criar e gerir carteira de investimentos.

Campos de posição:

* empresa;
* ticker;
* data de compra;
* preço de compra;
* número de ações;
* carteira;
* valor investido;
* preço atual;
* valor atual;
* rentabilidade em valor;
* rentabilidade em percentagem.

Funcionalidades:

* adicionar posição;
* editar posição;
* eliminar posição com ícone de caixote do lixo;
* recalcular totais após alterações;
* mostrar total da carteira;
* mostrar rentabilidade agregada.

---

## Wishlist

A aplicação deve ter uma wishlist de empresas a analisar futuramente.

Funcionalidades:

* adicionar ticker/empresa;
* guardar observações;
* converter empresa da wishlist para análise completa;
* eliminar item da wishlist.

---

## Base de dados sugerida

### Company

* id
* name
* ticker
* exchange
* country
* region_type: US / NON_US
* cik
* stockanalysis_url
* primary_data_source
* created_at
* updated_at
* last_imported_at
* last_refreshed_at

### FinancialStatementYear

* id
* company_id
* fiscal_year
* period_type
* currency
* filing_type
* filing_date
* source_type
* source_url
* import_method
* data_status
* checksum
* created_at
* updated_at

### FinancialLineItem

* id
* statement_year_id
* statement_type
* normalized_key
* source_label
* raw_value
* normalized_value
* unit
* confidence_score
* source_type
* source_reference
* created_at
* updated_at

### Valuation

* id
* company_id
* valuation_method
* discount_rate
* growth_rate_years_1_5
* growth_rate_years_6_10
* terminal_growth_rate
* margin_of_safety
* intrinsic_market_cap
* intrinsic_value_per_share
* intrinsic_value_with_margin
* current_price
* upside
* expected_irr
* decision
* created_at
* updated_at

### PortfolioPosition

* id
* company_id
* ticker
* purchase_date
* purchase_price
* quantity
* portfolio_name
* current_price
* current_value
* invested_value
* return_value
* return_percentage
* created_at
* updated_at

### WishlistItem

* id
* ticker
* company_name
* notes
* status
* created_at
* updated_at

---

## Regras críticas

* A aplicação é de investimentos.
* Dados financeiros devem vir da SEC para empresas EUA e StockAnalysis para empresas não EUA.
* Dados importados ficam persistidos em base de dados.
* Atualização é incremental por defeito.
* O preço atual da ação deve ser online.
* Valuation não pode apresentar `Infinity%`, `NaN` ou preço `0.00` falso.
* Eliminações devem pedir confirmação.
* Não recriar a aplicação de raiz quando forem pedidas melhorias: alterar apenas os módulos necessários.
