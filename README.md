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

## Autenticação e gestão de utilizadores

A aplicação tem acesso restrito: requer login para todas as páginas.

* autenticação feita via Supabase Auth (email + password);
* sem registo público — só administradores criam novas contas;
* dois tipos de acesso: `admin` e `user`;
* `admin`: acesso total, incluindo gestão de utilizadores;
* `user`: acesso a todas as funcionalidades, exceto gestão de utilizadores;
* novas contas são criadas com password temporária e flag `must_change_password`;
* no primeiro login, o utilizador é obrigado a definir uma password nova antes de continuar;
* qualquer rota não autenticada deve redirecionar para `/login`;
* deve existir botão de terminar sessão sempre visível.

### Gestão de utilizadores (admin)

Página exclusiva para administradores, com:

* listagem de utilizadores (email, tipo de acesso, data de criação);
* criar utilizador (email + password temporária + tipo de acesso);
* remover utilizador, com confirmação;
* um administrador não pode remover a própria conta.

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

### Persistência do valuation

* os inputs e o resultado do DCF ficam guardados por empresa (1 valuation ativa por ticker);
* ao reabrir a empresa, o valuation guardado é carregado automaticamente, sem necessidade de recalcular;
* guardar também o preço da ação no momento do cálculo;
* recalcular e atualizar o valuation guardado sempre que o utilizador alterar inputs ou recalcular.

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

## Alertas de preço

A aplicação deve permitir alertas de preço por email, por empresa.

### Alertas automáticos

* criados automaticamente para cada empresa analisada, um por classificação (Investir, Atento, Aguardar);
* o utilizador pode ativar/desativar cada alerta automático;
* quando ativo, dispara um email sempre que a classificação da empresa mudar (ex.: Aguardar → Atento).

### Alertas manuais

* o utilizador define um preço-alvo e a direção (acima/abaixo);
* dispara um email quando o preço atual cruzar o preço-alvo;
* após disparar, o alerta fica marcado como acionado (`triggered`);
* eliminar alerta manual.

### Execução

* verificação periódica (de hora a hora) do preço atual de todas as empresas com alertas ativos;
* comparação com o estado anterior para detetar mudança de classificação ou cruzamento de preço-alvo;
* envio de email com o resumo do alerta (empresa, preço atual, valor intrínseco, classificação).

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
* opção de eliminar empresa com ícone de caixote do lixo;
* indicador discreto (ícone âmbar), em coluna própria e fixa, quando a empresa tem notas escritas — em hover mostra o início das notas.

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

### Documentos anexados

A página da empresa deve permitir anexar relatórios/documentos próprios (PDF ou DOCX):

* upload de ficheiro, associado a um ano e, opcionalmente, mês/data de referência;
* título do relatório;
* ficheiros DOCX devem ser convertidos para HTML para leitura direta na aplicação;
* listagem dos documentos por empresa, ordenada por período;
* eliminar documento, com remoção do ficheiro e do registo;
* acesso ao ficheiro original através de link temporário (signed URL).

### Notas por empresa

Cada empresa tem um separador "Notas" (na barra de tabs, depois de "Cash Flow") para texto livre:

* campo de texto (textarea) sem formatação;
* guardado automaticamente 1,5s após o utilizador parar de escrever, ou de imediato através do botão "Guardar";
* mostra a data da última atualização das notas, no formato mm/aaaa;
* as notas ficam persistidas na tabela `companies` (campo `notes`), por empresa.

---

## Portfolio

A aplicação deve permitir criar e gerir carteira de investimentos, com suporte a múltiplos brokers e múltiplos membros/donos da carteira.

A posição de cada ticker é calculada a partir do histórico de transações e dividendos, e não guardada como valor fixo.

### Transações (compra/venda)

Campos:

* ticker / empresa;
* tipo: compra ou venda;
* data;
* preço por ação;
* quantidade;
* moeda (EUR / USD);
* comissões (fees);
* broker;
* notas.

### Dividendos

Campos:

* ticker / empresa;
* data;
* valor por ação;
* quantidade;
* moeda;
* broker;
* notas.

### Cálculo de posições

Para cada ticker, a aplicação deve calcular:

* quantidade atual (compras − vendas);
* preço médio de compra (WAC — weighted average cost);
* valor investido e valor atual, convertidos para EUR;
* retorno de ações: realizado (vendas) + não realizado (posição em carteira);
* retorno de dividendos, separado do retorno de ações;
* retorno total (ações + dividendos), em valor e em percentagem.

### Membros e brokers

* a carteira é partilhada por membros pré-definidos (ex.: V&J, Dinis, Mariana);
* cada movimento de liquidez pode ser repartido entre membros, por valor e percentagem;
* cada transação/dividendo/movimento de liquidez está associado a um broker (ex.: IBKR).

### Liquidez (cash)

Registo de movimentos de liquidez por broker:

* tipos: depósito, levantamento, dividendo, compra, venda;
* valor (positivo = entrada, negativo = saída);
* moeda (EUR / USD);
* repartição por membro.

### Funcionalidades

* adicionar/eliminar transação, dividendo e movimento de liquidez, com confirmação;
* recalcular totais e rentabilidades após qualquer alteração;
* mostrar total da carteira e rentabilidade agregada, com decomposição por ticker, por broker e por membro;
* indicador discreto (ícone âmbar) junto ao nome da empresa, nas posições com notas escritas — em hover mostra o início das notas.

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
* notes
* notes_updated_at
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

### WishlistItem

* id
* ticker
* company_name
* notes
* status
* created_at
* updated_at

### PriceAlert

* id
* ticker
* company_id
* company_name
* alert_type: above / below (nulo para alertas automáticos)
* target_price (nulo para alertas automáticos)
* currency
* alert_category: manual / auto_invest / auto_atento / auto_aguardar
* is_active
* triggered
* triggered_at
* created_at
* updated_at

### DCFValuation

* ticker (chave única)
* company_id
* method
* inputs (JSON)
* result (JSON)
* price_at_calculation
* calculated_at
* updated_at

### CompanyReport

* id
* ticker
* company_id
* period_year
* period_month
* report_date
* title
* content_html
* file_path
* file_type
* created_at
* updated_at

### PortfolioTransaction (substitui PortfolioPosition)

* id
* ticker
* company_id
* type: buy / sell
* date
* price_per_share
* quantity
* currency
* fees
* broker
* notes
* created_at

### PortfolioDividend

* id
* ticker
* company_id
* date
* amount_per_share
* quantity
* currency
* broker
* notes
* created_at

### PortfolioMember

* id
* name
* created_at

### PortfolioCash

* id
* date
* type: deposit / withdrawal / dividend / buy / sell
* ticker
* amount (positivo = entrada, negativo = saída)
* currency
* broker
* notes
* created_at
* updated_at

### PortfolioCashMember

* id
* cash_id
* member_id
* amount
* percentage

---

## Regras críticas

* A aplicação é de investimentos.
* Dados financeiros devem vir da SEC para empresas EUA e StockAnalysis para empresas não EUA.
* Dados importados ficam persistidos em base de dados.
* Atualização é incremental por defeito.
* O preço atual da ação deve ser online.
* Valuation não pode apresentar `Infinity%`, `NaN` ou preço `0.00` falso.
* Eliminações devem pedir confirmação.
* Acesso à aplicação requer autenticação; não deve haver registo público.
* Apenas administradores podem criar ou remover utilizadores.
* Alertas de preço (manuais e automáticos) devem ser verificados periodicamente e disparar email.
* Não recriar a aplicação de raiz quando forem pedidas melhorias: alterar apenas os módulos necessários.
