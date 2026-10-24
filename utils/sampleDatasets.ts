export interface SampleDataset {
  id: string;
  name: string;
  type: string;
  badgeColor: string;
  description: string;
  suggestedQuestions: string[];
  fileName: string;
  content: string;
}

export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'csv-sales',
    name: 'Multi-Region Sales & Units',
    type: 'Structured Table (CSV)',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Quarterly transactions across product categories, revenues, margins, and customer satisfaction.',
    suggestedQuestions: [
      'What are the top 3 product categories by total revenue?',
      'Show me a bar chart of total revenue per region',
      'What is the average profit margin across regions?',
    ],
    fileName: 'quarterly_sales_data.csv',
    content: `TransactionID,Date,Region,ProductCategory,UnitsSold,UnitPrice,Revenue,ProfitMargin,SatisfactionScore
TX-1001,2024-01-15,North America,Enterprise Cloud,45,1200,54000,0.68,4.8
TX-1002,2024-01-18,Europe,Hardware Terminals,120,350,42000,0.32,4.1
TX-1003,2024-01-22,Asia Pacific,Security Suite,85,600,51000,0.74,4.9
TX-1004,2024-02-04,North America,Hardware Terminals,90,350,31500,0.29,3.9
TX-1005,2024-02-11,Latin America,Consulting Services,30,1500,45000,0.55,4.6
TX-1006,2024-02-19,Europe,Enterprise Cloud,60,1200,72000,0.65,4.7
TX-1007,2024-03-02,Asia Pacific,Consulting Services,40,1500,60000,0.58,4.5
TX-1008,2024-03-12,Middle East,Security Suite,55,600,33000,0.71,4.4
TX-1009,2024-03-20,North America,Security Suite,110,600,66000,0.72,4.8
TX-1010,2024-03-28,Europe,Consulting Services,50,1500,75000,0.60,4.9`,
  },
  {
    id: 'json-nested',
    name: 'Customer Account & Event Telemetry',
    type: 'Hierarchical Object (JSON)',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    description: 'Nested customer accounts with subscriptions, usage quotas, feature flags, and billing histories.',
    suggestedQuestions: [
      'Summarize active plan tiers and recurring monthly spend across accounts',
      'Show me a pie chart of customers by subscription plan',
      'Which customers have churn risk indicators or exceeded API quotas?',
    ],
    fileName: 'customer_accounts_telemetry.json',
    content: JSON.stringify(
      [
        {
          accountId: 'acc_98124',
          organization: 'Apex Fintech Solutions',
          plan: 'Enterprise Tier 3',
          mrr: 4500,
          status: 'active',
          metrics: {
            apiCallsMonthly: 1420000,
            quotaLimit: 2000000,
            activeSeats: 84,
            storageGb: 420.5,
          },
          churnRiskScore: 0.12,
          featureFlags: { aiCopilot: true, customVpc: true, sso: true },
        },
        {
          accountId: 'acc_55321',
          organization: 'BioHealth Labs',
          plan: 'Growth Pro',
          mrr: 1800,
          status: 'active',
          metrics: {
            apiCallsMonthly: 490000,
            quotaLimit: 500000,
            activeSeats: 32,
            storageGb: 110.0,
          },
          churnRiskScore: 0.65,
          featureFlags: { aiCopilot: false, customVpc: false, sso: true },
        },
        {
          accountId: 'acc_77190',
          organization: 'HyperScale Logistics',
          plan: 'Enterprise Tier 3',
          mrr: 6200,
          status: 'active',
          metrics: {
            apiCallsMonthly: 3100000,
            quotaLimit: 3000000,
            activeSeats: 160,
            storageGb: 890.2,
          },
          churnRiskScore: 0.28,
          featureFlags: { aiCopilot: true, customVpc: true, sso: true },
        },
        {
          accountId: 'acc_22104',
          organization: 'Zenith Retail Media',
          plan: 'Starter Team',
          mrr: 450,
          status: 'active',
          metrics: {
            apiCallsMonthly: 62000,
            quotaLimit: 100000,
            activeSeats: 8,
            storageGb: 22.4,
          },
          churnRiskScore: 0.42,
          featureFlags: { aiCopilot: false, customVpc: false, sso: false },
        },
        {
          accountId: 'acc_88912',
          organization: 'OmniStream Cloud',
          plan: 'Growth Pro',
          mrr: 2100,
          status: 'active',
          metrics: {
            apiCallsMonthly: 410000,
            quotaLimit: 500000,
            activeSeats: 45,
            storageGb: 195.0,
          },
          churnRiskScore: 0.18,
          featureFlags: { aiCopilot: true, customVpc: false, sso: true },
        },
      ],
      null,
      2
    ),
  },
  {
    id: 'unstructured-logs',
    name: 'Production Outage & Error Trace Logs',
    type: 'Unstructured System Logs',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'Raw server log stream with HTTP statuses, microservice timeouts, memory alerts, and stack traces.',
    suggestedQuestions: [
      'What was the root cause and timeline of errors in these logs?',
      'Count error occurrences by service name and show a bar chart',
      'What mitigation steps should engineering take immediately?',
    ],
    fileName: 'prod_cluster_incident.log',
    content: `2024-10-24T08:14:02.112Z [INFO] service=auth-api host=node-04 req_id=e7b1 msg="Token validation successful for user_9823"
2024-10-24T08:14:05.882Z [WARN] service=payment-gateway host=node-12 req_id=a1c9 latency_ms=1840 msg="Slow upstream bank gateway response"
2024-10-24T08:14:12.304Z [ERROR] service=payment-gateway host=node-12 req_id=b4f2 code=ETIMEDOUT msg="Connection to stripe-webhook-relay timed out after 5000ms"
2024-10-24T08:14:15.901Z [ERROR] service=order-processor host=node-01 req_id=c8d3 code=DEPENDENCY_FAILURE msg="Failed to capture payment for order_88412: payment-gateway returned 504"
2024-10-24T08:14:18.102Z [WARN] service=database-pool host=db-replica-02 msg="Active connection pool exhausted: 98/100 active, queue_depth=42"
2024-10-24T08:14:22.441Z [FATAL] service=order-processor host=node-01 err="OutOfMemoryError: Java heap space" stack="at com.orders.QueueConsumer.processBatch(QueueConsumer.java:184) at java.base/java.lang.Thread.run(Thread.java:833)"
2024-10-24T08:14:25.011Z [ERROR] service=ingress-proxy host=edge-lb-01 status=502 method=POST path="/api/v1/checkout" upstream="node-01:8080" msg="Bad Gateway: connection refused"
2024-10-24T08:14:30.550Z [ERROR] service=ingress-proxy host=edge-lb-01 status=502 method=POST path="/api/v1/checkout" upstream="node-01:8080" msg="Bad Gateway: connection refused"
2024-10-24T08:14:45.120Z [INFO] service=kubernetes-autoscaler msg="Pod order-processor-node-01 restart scheduled due to OOMKilled"
2024-10-24T08:15:10.820Z [INFO] service=order-processor host=node-01 status="healthy" msg="Service restarted, recovering message queue depth=841"`,
  },
  {
    id: 'unstructured-feedback',
    name: 'Customer Feedback & Voice-of-Customer',
    type: 'Unstructured Qualitative Text',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    description: 'Freeform customer interview transcripts, Zendesk feedback comments, and NPS review statements.',
    suggestedQuestions: [
      'What are the key themes and recurring pain points mentioned by users?',
      'Categorize feedback into positive, neutral, and negative sentiment with counts',
      'What top 3 feature requests should product leadership prioritize?',
    ],
    fileName: 'customer_interview_feedback.txt',
    content: `[Customer: Marcus Vance, VP Data at Meridian Capital]
"The new dashboard load times are incredible compared to last quarter—our reporting team saves at least 30 minutes every morning. However, we desperately need multi-file joins or combined data queries. Right now we have to manually reconcile CSV exports in Excel, which defeats the purpose. Also, permissioning for read-only executive viewers is confusing."

[Customer: Elena Rostova, Lead Analytics at UrbanKite eCommerce]
"I love the chart generation when asking conversational questions. It felt like magic when I asked for cohort retention and it plotted it instantly. But when we uploaded our marketing attribution file with ragged columns and UTM tracking codes, it previously gave an error instead of letting us query it! If you can support messy unformatted text and unstructured notes, that would be a complete game changer."

[Customer: Dev Sharma, CTO at FlowSync Technologies]
"Reliability has been solid—99.9% uptime over the past 6 months. Pricing is starting to become a friction point as our team expands from 20 to 50 engineers. We'd love floating licenses or team-wide workspace pricing. Also please add export to PDF for executive briefings."

[Customer: Chloe Dubois, Product Ops at HealthSpire]
"Our clinical team collects patient survey free text. We have thousands of unformatted doctor interview notes and open-ended feedback answers. Being able to drop those text files in and immediately ask 'What are patients complaining about regarding appointment scheduling?' has solved an issue we struggled with for years. Keep the interface simple and fast."`,
  },
];
