import React, { useEffect, useState } from "react";
import {
    Text,
    Flex,
    LoadingSpinner,
    Alert,
    hubspot,
    Box,
    Divider,
    Icon,
    Tooltip,
    NumberInput,
    Button,
    Tag
} from "@hubspot/ui-extensions";

// Define types
interface PrecosResponse {
    pv1: number | null;
    pv2: number | null;
    pv3: number | null;
}

// Stage Mapping
const STAGE_MAP: Record<string, { label: string; variant: "default" | "success" | "warning" | "error" | "info" }> = {
    "decisionmakerboughtin": { label: "Aguardando Liberação", variant: "warning" },
    "presentationscheduled": { label: "Pedido (Aguardando Conferência)", variant: "info" },
};

hubspot.extend<'crm.record.tab'>(({ context }) => (
    <PrecosCard
        context={context}
    />
));

interface PrecosCardProps {
    context: {
        crm: {
            objectId: number;
            objectType?: string;
        };
    };
}

const PrecosCard = ({ context }: PrecosCardProps) => {
    const [precos, setPrecos] = useState<PrecosResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [missingData, setMissingData] = useState<any>(null);

    // Stock & Quantity State
    const [stock, setStock] = useState<number | null>(null);
    const [neededQty, setNeededQty] = useState<number | null>(null);

    // Amount State
    const [amount, setAmount] = useState<number | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveWarning, setSaveWarning] = useState<string | null>(null);

    // Stage State
    const [dealStage, setDealStage] = useState<string | null>(null);
    const [converting, setConverting] = useState(false);
    const [convertError, setConvertError] = useState<string | null>(null);
    const [convertSuccess, setConvertSuccess] = useState(false);

    // Guard to prevent multiple fetches for the same ID
    const lastFetchedId = React.useRef<number | null>(null);

    useEffect(() => {
        const loadPrices = async () => {
            if (lastFetchedId.current === context.crm.objectId) return;

            setLoading(true);
            setError(null);
            setMissingData(null);
            lastFetchedId.current = context.crm.objectId;

            try {
                const response = await hubspot.fetch("https://api.gcrux.com/hubspot/prices/deal", {
                    method: "POST",
                    body: {
                        objectId: context.crm.objectId
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Erro API: ${response.status} - ${errorText}`);
                }

                const result = await response.json();

                if (result && result.status === "SUCCESS") {
                    setPrecos(result.prices);
                    setStock(result.stock);
                    setNeededQty(result.quantity);
                    if (result.currentAmount) {
                        setAmount(Number(result.currentAmount));
                    }
                    if (result.currentStage) {
                        setDealStage(result.currentStage);
                    }
                } else if (result && result.status === "MISSING_DATA") {
                    setMissingData(result.details);
                } else if (result && result.error) {
                    setError(result.error);
                } else {
                    setError("Resposta inesperada do servidor.");
                }

            } catch (err: any) {
                console.error("Erro na chamada API:", err);
                setError(`Não foi possível carregar os preços. (${err.message})`);
            } finally {
                setLoading(false);
            }
        };

        if (context.crm.objectId) {
            loadPrices();
        }
    }, [context.crm.objectId]);

    const handleSaveAmount = async (valueOverride?: number) => {
        const val = valueOverride !== undefined ? valueOverride : amount;
        if (val === null || val === undefined) return;

        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        setSaveWarning(null);

        try {
            const response = await hubspot.fetch("https://api.gcrux.com/hubspot/update/deal", {
                method: "POST",
                body: {
                    objectId: context.crm.objectId,
                    amount: val
                }
            });

            if (!response.ok) {
                throw new Error("Falha ao salvar valor");
            }

            const result = await response.json();

            if (result.status === "WARNING") {
                setSaveWarning(result.message);
            } else {
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3000);
            }

        } catch (err: any) {
            setSaveError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleConvertToOrder = async () => {
        setConverting(true);
        setConvertError(null);
        setConvertSuccess(false);

        try {
            const response = await hubspot.fetch("https://api.gcrux.com/hubspot/convert-to-order", {
                method: "POST",
                body: { objectId: context.crm.objectId }
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Erro ao converter para pedido");
            }

            setConvertSuccess(true);
            setDealStage("presentationscheduled");
            setTimeout(() => setConvertSuccess(false), 5000);

        } catch (err: any) {
            setConvertError(err.message);
        } finally {
            setConverting(false);
        }
    };

    const formatCurrency = (value: number | null): string => {
        if (value === null || value === undefined) return "---";
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(value);
    };

    if (loading) {
        return <LoadingSpinner label="Consultando tabelas Sankhya..." />;
    }

    if (missingData) {
        return (
            <Alert title="Dados Incompletos" variant="warning">
                Para visualizar os preços, certifique-se que o negócio tem:
                <Box>• Produto (Item de Linha)</Box>
                <Box>• Parceiro (Empresa associada com cód. Sankhya)</Box>
            </Alert>
        );
    }

    if (error) {
        return (
            <Alert title="Erro" variant="error">
                {error}
                <Box>
                    <Text variant="microcopy">Tente atualizar a página.</Text>
                </Box>
            </Alert>
        );
    }

    const stageInfo = dealStage && STAGE_MAP[dealStage];

    return (
        <Flex direction="column" gap="md">

            {/* ESTEIRA STATUS & ESTOQUE */}
            <Box>
                <Flex align="center" gap="md" justify="between">
                    <Flex align="center" gap="xs">
                        <Text format={{ fontWeight: "bold" }}>Status:</Text>
                        {dealStage && (
                            stageInfo ? (
                                <Tag variant={stageInfo.variant}>{stageInfo.label}</Tag>
                            ) : (
                                <Text>{dealStage}</Text>
                            )
                        )}
                    </Flex>

                    {stock !== null && (
                        <Flex align="center" gap="xs">
                            <Text format={{ fontWeight: "bold" }}>Estoque:</Text>
                            <Tag variant={(stock < (neededQty || 0)) ? "error" : "success"}>
                                {stock} disponíveis
                            </Tag>
                        </Flex>
                    )}
                </Flex>

                {(stock !== null && neededQty !== null && stock < neededQty) && (
                    <Box paddingTop="xs">
                        <Alert title="Possível Corte de Estoque" variant="error">
                            Atenção: O estoque atual ({stock}) é menor que a quantidade do pedido ({neededQty}). O item poderá ser cortado se faturado agora.
                        </Alert>
                    </Box>
                )}
                <Divider />
            </Box>

            <Flex direction="row" gap="md" justify="between">
                {/* PV1 */}
                <Box>
                    <Flex align="center" gap="xs">
                        <Text format={{ fontWeight: "bold" }}>PV1 - Alta</Text>
                        <Icon name="info" size="sm" />
                    </Flex>
                    <Text variant="microcopy">Tabela 1</Text>
                    <Text format={{ fontWeight: "bold" }}>
                        {formatCurrency(precos?.pv1 ?? null)}
                    </Text>
                    <Flex direction="column" gap="xs">
                        <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => {
                                if (precos?.pv1) {
                                    setAmount(precos.pv1);
                                    handleSaveAmount(precos.pv1);
                                }
                            }}
                        >
                            Aplicar
                        </Button>
                    </Flex>
                </Box>

                <Divider />

                {/* PV2 */}
                <Box>
                    <Flex align="center" gap="xs">
                        <Text format={{ fontWeight: "bold" }}>PV2 - Média</Text>
                    </Flex>
                    <Text variant="microcopy">Tabela 2</Text>
                    <Text format={{ fontWeight: "bold" }}>
                        {formatCurrency(precos?.pv2 ?? null)}
                    </Text>
                    <Flex direction="column" gap="xs">
                        <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => {
                                if (precos?.pv2) {
                                    setAmount(precos.pv2);
                                    handleSaveAmount(precos.pv2);
                                }
                            }}
                        >
                            Aplicar
                        </Button>
                    </Flex>
                </Box>

                <Divider />

                {/* PV3 */}
                <Box>
                    <Flex align="center" gap="xs">
                        <Text format={{ fontWeight: "bold" }}>PV3 - Baixa</Text>
                    </Flex>
                    <Text variant="microcopy">Tabela 3</Text>
                    <Text format={{ fontWeight: "bold" }}>
                        {formatCurrency(precos?.pv3 ?? null)}
                    </Text>
                    <Flex direction="column" gap="xs">
                        <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => {
                                if (precos?.pv3) {
                                    setAmount(precos.pv3);
                                    handleSaveAmount(precos.pv3);
                                }
                            }}
                        >
                            Aplicar
                        </Button>
                    </Flex>
                </Box>
            </Flex>

            <Divider />

            {/* AMOUNT INPUT SECTION */}
            <Flex direction="column" gap="sm">
                <Text format={{ fontWeight: "bold" }}>Valor do Negócio (Amount)</Text>

                <Flex gap="sm" align="end">
                    <Box flex={1}>
                        <NumberInput
                            name="amount"
                            label="Valor Total"
                            value={amount}
                            min={0}
                            onChange={(value) => setAmount(value)}
                            onBlur={() => {
                                handleSaveAmount();
                            }}
                            error={!!saveError || !!saveWarning}
                            validationMessage={saveError ?? (saveWarning ?? undefined)}
                        />
                    </Box>
                    {saving && (
                        <Box>
                            <LoadingSpinner size="sm" label="Salvando..." layout="centered" />
                        </Box>
                    )}
                    {saveSuccess && (
                        <Box>
                            <Text variant="microcopy">✓ Salvo com sucesso!</Text>
                        </Box>
                    )}
                </Flex>
                {saveWarning && (
                    <Alert title="Atenção" variant="warning">
                        {saveWarning}
                    </Alert>
                )}
                <Text variant="microcopy">O valor é salvo automaticamente ao clicar em Aplicar ou sair do campo.</Text>
            </Flex>

            <Divider />

            {/* ERROR HANDLING FOR CONVERSION */}
            {convertError && (
                <Alert title="Erro ao Faturar" variant="error">
                    {convertError}
                </Alert>
            )}
            {convertSuccess && (
                <Alert title="Sucesso" variant="success">
                    Pedido gerado com sucesso!
                </Alert>
            )}

            {/* CONVERSION TRIGGER BUTTON */}
            <Button
                variant="primary"
                onClick={handleConvertToOrder}
                disabled={converting || (dealStage === "decisionmakerboughtin")}
            >
                {converting ? "Gerando Pedido..." : "Faturar (Gerar Pedido)"}
            </Button>

        </Flex>
    );
};

export default PrecosCard;
